//! Local encrypted credential store for Yole-owned managed model secrets.
//!
//! Unsigned beta builds cannot use macOS Keychain without hostile trust prompts.
//! Managed model API keys are therefore stored as AES-GCM encrypted payloads in
//! Yole's SQLite DB. The local key lives in the same DB so app-data backups and
//! machine moves preserve model credentials with the rest of the managed config.
//! This is a UX-first beta tradeoff, not a system credential-store boundary.

use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::rand::{SecureRandom, SystemRandom};

use crate::db::{ManagedModelSecretRow, SqliteYole};
use crate::error::{YoleError, Result};

const KEY_ID: &str = "local-sqlite-v1";
const ALGORITHM: &str = "aes-256-gcm";
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 12;

pub fn managed_model_api_key_ref(model_id: &str) -> String {
    format!("managed-model:{model_id}")
}

pub fn managed_provider_api_key_ref(provider_id: &str) -> String {
    format!("managed-provider:{provider_id}")
}

pub async fn set_secret(yole: &SqliteYole, api_key_ref: &str, secret: &str) -> Result<()> {
    let key_material = ensure_local_key(yole).await?;
    let nonce = random_nonce()?;
    let ciphertext = encrypt(&key_material, &nonce, api_key_ref, secret.as_bytes())?;
    yole
        .upsert_managed_model_secret(api_key_ref, KEY_ID, ALGORITHM, &nonce, &ciphertext)
        .await
}

pub async fn get_secret(yole: &SqliteYole, api_key_ref: &str) -> Result<String> {
    let row = yole
        .managed_model_secret(api_key_ref)
        .await?
        .ok_or_else(|| YoleError::InvalidArgs {
            message: format!("credential missing for {api_key_ref}"),
        })?;
    let key_material = yole
        .managed_model_secret_key(&row.key_id)
        .await?
        .ok_or_else(|| YoleError::Internal {
            message: format!("credential key {} is missing", row.key_id),
        })?;
    let plaintext = decrypt_row(&key_material, api_key_ref, row)?;
    String::from_utf8(plaintext).map_err(|e| YoleError::Internal {
        message: format!("credential plaintext is not valid UTF-8 for {api_key_ref}: {e}"),
    })
}

pub async fn delete_secret(yole: &SqliteYole, api_key_ref: &str) -> Result<()> {
    yole.delete_managed_model_secret(api_key_ref).await
}

async fn ensure_local_key(yole: &SqliteYole) -> Result<Vec<u8>> {
    if let Some(existing) = yole.managed_model_secret_key(KEY_ID).await? {
        return validate_key_material(existing);
    }

    let candidate = random_key()?;
    yole
        .insert_managed_model_secret_key(KEY_ID, &candidate)
        .await?;
    let stored = yole
        .managed_model_secret_key(KEY_ID)
        .await?
        .ok_or_else(|| YoleError::Internal {
            message: "local credential key was not persisted".into(),
        })?;
    validate_key_material(stored)
}

fn encrypt(
    key_material: &[u8],
    nonce_bytes: &[u8; NONCE_LEN],
    api_key_ref: &str,
    plaintext: &[u8],
) -> Result<Vec<u8>> {
    let key = less_safe_key(key_material)?;
    let nonce = Nonce::assume_unique_for_key(*nonce_bytes);
    let mut in_out = plaintext.to_vec();
    key.seal_in_place_append_tag(nonce, Aad::from(api_key_ref.as_bytes()), &mut in_out)
        .map_err(|_| YoleError::Internal {
            message: format!("credential encryption failed for {api_key_ref}"),
        })?;
    Ok(in_out)
}

fn decrypt_row(
    key_material: &[u8],
    api_key_ref: &str,
    row: ManagedModelSecretRow,
) -> Result<Vec<u8>> {
    if row.encryption_version != 1 {
        return Err(YoleError::Internal {
            message: format!(
                "unsupported credential encryption version {} for {api_key_ref}",
                row.encryption_version
            ),
        });
    }
    if row.algorithm != ALGORITHM {
        return Err(YoleError::Internal {
            message: format!(
                "unsupported credential algorithm {} for {api_key_ref}",
                row.algorithm
            ),
        });
    }
    let nonce_bytes: [u8; NONCE_LEN] =
        row.nonce
            .try_into()
            .map_err(|nonce: Vec<u8>| YoleError::Internal {
                message: format!(
                    "credential nonce has invalid length {} for {api_key_ref}",
                    nonce.len()
                ),
            })?;
    let key = less_safe_key(key_material)?;
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut in_out = row.ciphertext;
    let plaintext = key
        .open_in_place(nonce, Aad::from(api_key_ref.as_bytes()), &mut in_out)
        .map_err(|_| YoleError::InvalidArgs {
            message: format!("credential decrypt failed for {api_key_ref}"),
        })?;
    Ok(plaintext.to_vec())
}

fn less_safe_key(key_material: &[u8]) -> Result<LessSafeKey> {
    let key_material = validate_key_material(key_material.to_vec())?;
    let key = UnboundKey::new(&AES_256_GCM, &key_material).map_err(|_| YoleError::Internal {
        message: "credential key initialization failed".into(),
    })?;
    Ok(LessSafeKey::new(key))
}

fn validate_key_material(key_material: Vec<u8>) -> Result<Vec<u8>> {
    if key_material.len() != KEY_LEN {
        return Err(YoleError::Internal {
            message: format!(
                "credential key has invalid length {}; expected {KEY_LEN}",
                key_material.len()
            ),
        });
    }
    Ok(key_material)
}

fn random_key() -> Result<[u8; KEY_LEN]> {
    let rng = SystemRandom::new();
    let mut bytes = [0_u8; KEY_LEN];
    rng.fill(&mut bytes).map_err(|_| YoleError::Internal {
        message: "credential key generation failed".into(),
    })?;
    Ok(bytes)
}

fn random_nonce() -> Result<[u8; NONCE_LEN]> {
    let rng = SystemRandom::new();
    let mut bytes = [0_u8; NONCE_LEN];
    rng.fill(&mut bytes).map_err(|_| YoleError::Internal {
        message: "credential nonce generation failed".into(),
    })?;
    Ok(bytes)
}

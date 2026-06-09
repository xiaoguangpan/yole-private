use std::time::Duration;

use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

use crate::api::{
    YoleApi, ManagedModelAuthKind, ManagedModelProtocol, ManagedModelProviderRecord,
    ManagedModelRecord,
};
use crate::credential_store;
use crate::db::{SqliteYole, UpsertManagedModelMetadata, UpsertManagedModelProviderMetadata};
use crate::error::{YoleError, Result};

const PROVIDER_ID: &str = "yole";
const MODEL_ID: &str = "yole-default";
const PROVIDER_DISPLAY_NAME: &str = "Yole";
const MODEL_DISPLAY_NAME: &str = "Yole";
const PROVISIONER_URL_PREF: &str = "yole_provisioner_url";
const INSTALL_ID_PREF: &str = "yole_install_id";
const ACCOUNT_PREF: &str = "yole_account";
const ACCOUNT_TOKEN_REF: &str = "yole-account:token";
const REQUEST_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Clone, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum YoleProvisioningResult {
    Unconfigured,
    SkippedExistingModel,
    Provisioned {
        provider: ManagedModelProviderRecord,
        model: ManagedModelRecord,
        expires_at: Option<String>,
        account: YoleAccountStatus,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoleContactInfo {
    pub wechat_id: Option<String>,
    pub wechat_qr_url: Option<String>,
    pub overseas: Option<String>,
    pub top_up_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoleAccountStatus {
    #[serde(default)]
    pub support_id: String,
    pub user_id: i64,
    #[serde(default)]
    pub username: String,
    pub balance_usd: f64,
    pub quota_points: i64,
    pub low_balance: bool,
    pub contact: YoleContactInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YoleAccountMetadata {
    support_id: String,
    user_id: i64,
    username: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
struct RegisterRequest {
    install_id: String,
    device_id_hash: String,
    app_version: String,
    os: String,
    arch: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct RegisterResponse {
    newapi_base_url: String,
    token: String,
    default_model: String,
    #[serde(default)]
    expires_at: Option<String>,
    account: ProvisionerAccountResponse,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ProvisionerContactResponse {
    wechat_id: Option<String>,
    wechat_qr_url: Option<String>,
    overseas: Option<String>,
    top_up_message: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ProvisionerAccountResponse {
    account_token: Option<String>,
    support_id: String,
    user_id: i64,
    username: String,
    balance_usd: f64,
    quota_points: i64,
    low_balance: bool,
    contact: ProvisionerContactResponse,
}

pub async fn ensure_trial_model<R: Runtime>(app: &AppHandle<R>) -> Result<YoleProvisioningResult> {
    let yole = SqliteYole::open().await?;
    if !yole.list_managed_models().await?.is_empty() {
        return Ok(YoleProvisioningResult::SkippedExistingModel);
    }

    let Some(provisioner_url) = configured_provisioner_url(&yole).await? else {
        return Ok(YoleProvisioningResult::Unconfigured);
    };

    let install_id = ensure_install_id(&yole).await?;
    let response = register(
        &provisioner_url,
        RegisterRequest {
            install_id,
            device_id_hash: String::new(),
            app_version: app.package_info().version.to_string(),
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
        },
    )
    .await?;

    persist_yole_model(&yole, response).await
}

async fn configured_provisioner_url(yole: &SqliteYole) -> Result<Option<String>> {
    if let Some(value) = yole.get_pref_json(PROVISIONER_URL_PREF).await? {
        if let Some(url) = value.as_str().map(str::trim).filter(|s| !s.is_empty()) {
            return Ok(Some(url.to_string()));
        }
    }
    if let Some(url) = runtime_or_build_env("YOLE_PROVISIONER_URL") {
        return Ok(Some(url));
    }
    Ok(None)
}

fn runtime_or_build_env(name: &str) -> Option<String> {
    std::env::var(name)
        .ok()
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(ToOwned::to_owned)
        .or_else(|| match name {
            "YOLE_PROVISIONER_URL" => option_env!("YOLE_PROVISIONER_URL")
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(ToOwned::to_owned),
            _ => None,
        })
}

async fn ensure_install_id(yole: &SqliteYole) -> Result<String> {
    if let Some(value) = yole.get_pref_json(INSTALL_ID_PREF).await? {
        if let Some(existing) = value.as_str().map(str::trim).filter(|s| !s.is_empty()) {
            return Ok(existing.to_string());
        }
    }
    let id = format!("yole-install-{}", random_hex(16)?);
    yole
        .set_pref_json(INSTALL_ID_PREF, serde_json::json!(id))
        .await?;
    Ok(id)
}

pub async fn get_account_status() -> Result<Option<YoleAccountStatus>> {
    let yole = SqliteYole::open().await?;
    let Some(provisioner_url) = configured_provisioner_url(&yole).await? else {
        return Ok(stored_account_status(&yole).await?);
    };
    let account_token = match credential_store::get_secret(&yole, ACCOUNT_TOKEN_REF).await {
        Ok(token) => token,
        Err(_) => return Ok(stored_account_status(&yole).await?),
    };
    let response = account_status(&provisioner_url, &account_token).await?;
    persist_account(&yole, &response).await?;
    Ok(Some(response.into_status()))
}

async fn register(base_url: &str, request: RegisterRequest) -> Result<RegisterResponse> {
    let endpoint = register_endpoint(base_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| YoleError::Internal {
            message: format!("building Yole provisioner HTTP client failed: {e}"),
        })?;
    let resp = client
        .post(&endpoint)
        .json(&request)
        .send()
        .await
        .map_err(|e| YoleError::RunnerError {
            message: format!("Yole provisioner register request failed: {e}"),
        })?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| YoleError::RunnerError {
        message: format!("reading Yole provisioner response failed: {e}"),
    })?;
    if !status.is_success() {
        return Err(YoleError::RunnerError {
            message: format!(
                "Yole provisioner returned HTTP {}: {}",
                status.as_u16(),
                compact_body(&body)
            ),
        });
    }
    serde_json::from_str::<RegisterResponse>(&body).map_err(|e| YoleError::RunnerError {
        message: format!("Yole provisioner response is invalid JSON: {e}"),
    })
}

async fn account_status(base_url: &str, account_token: &str) -> Result<ProvisionerAccountResponse> {
    let endpoint = account_status_endpoint(base_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| YoleError::Internal {
            message: format!("building Yole provisioner HTTP client failed: {e}"),
        })?;
    let resp = client
        .get(&endpoint)
        .bearer_auth(account_token)
        .send()
        .await
        .map_err(|e| YoleError::RunnerError {
            message: format!("Yole account status request failed: {e}"),
        })?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| YoleError::RunnerError {
        message: format!("reading Yole account status response failed: {e}"),
    })?;
    if !status.is_success() {
        return Err(YoleError::RunnerError {
            message: format!(
                "Yole account status returned HTTP {}: {}",
                status.as_u16(),
                compact_body(&body)
            ),
        });
    }
    serde_json::from_str::<ProvisionerAccountResponse>(&body).map_err(|e| {
        YoleError::RunnerError {
            message: format!("Yole account status response is invalid JSON: {e}"),
        }
    })
}

async fn persist_yole_model(
    yole: &SqliteYole,
    response: RegisterResponse,
) -> Result<YoleProvisioningResult> {
    let api_base = nonempty(response.newapi_base_url, "newapi_base_url")?;
    let token = nonempty(response.token, "token")?;
    let model_name = nonempty(response.default_model, "default_model")?;
    let api_key_ref = credential_store::managed_provider_api_key_ref(PROVIDER_ID);

    credential_store::set_secret(yole, &api_key_ref, &token).await?;
    persist_account(yole, &response.account).await?;
    let provider = yole
        .upsert_managed_model_provider_metadata(UpsertManagedModelProviderMetadata {
            id: PROVIDER_ID.into(),
            display_name: PROVIDER_DISPLAY_NAME.into(),
            protocol: ManagedModelProtocol::Openai,
            auth_kind: ManagedModelAuthKind::ApiKey,
            api_base,
            api_key_ref,
        })
        .await?;
    let model = yole
        .upsert_managed_model_metadata(UpsertManagedModelMetadata {
            id: MODEL_ID.into(),
            provider_id: PROVIDER_ID.into(),
            display_name: MODEL_DISPLAY_NAME.into(),
            model: model_name,
            advanced_options: crate::managed_model_advanced_defaults(ManagedModelProtocol::Openai),
            make_default: true,
        })
        .await?;

    Ok(YoleProvisioningResult::Provisioned {
        provider,
        model,
        expires_at: response.expires_at,
        account: response.account.into_status(),
    })
}

async fn persist_account(yole: &SqliteYole, account: &ProvisionerAccountResponse) -> Result<()> {
    if let Some(token) = account
        .account_token
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        credential_store::set_secret(yole, ACCOUNT_TOKEN_REF, token).await?;
    }
    let metadata = YoleAccountMetadata {
        support_id: account.support_id.clone(),
        user_id: account.user_id,
        username: account.username.clone(),
    };
    yole
        .set_pref_json(
            ACCOUNT_PREF,
            serde_json::to_value(metadata).map_err(|e| YoleError::Internal {
                message: format!("serializing Yole account metadata failed: {e}"),
            })?,
        )
        .await
}

async fn stored_account_status(yole: &SqliteYole) -> Result<Option<YoleAccountStatus>> {
    let Some(value) = yole.get_pref_json(ACCOUNT_PREF).await? else {
        return Ok(None);
    };
    let metadata: YoleAccountMetadata =
        serde_json::from_value(value).map_err(|e| YoleError::Internal {
            message: format!("stored Yole account metadata is invalid: {e}"),
        })?;
    Ok(Some(YoleAccountStatus {
        support_id: metadata.support_id,
        user_id: metadata.user_id,
        username: metadata.username,
        balance_usd: 0.0,
        quota_points: 0,
        low_balance: false,
        contact: YoleContactInfo {
            wechat_id: None,
            wechat_qr_url: None,
            overseas: None,
            top_up_message: None,
        },
    }))
}

fn register_endpoint(base_url: &str) -> Result<String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(YoleError::InvalidArgs {
            message: "Yole provisioner URL is empty".into(),
        });
    }
    if trimmed.ends_with("/api/register") {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("{trimmed}/api/register"))
    }
}

fn account_status_endpoint(base_url: &str) -> Result<String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(YoleError::InvalidArgs {
            message: "Yole provisioner URL is empty".into(),
        });
    }
    if trimmed.ends_with("/api/account/status") {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("{trimmed}/api/account/status"))
    }
}

fn nonempty(value: String, field: &str) -> Result<String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err(YoleError::RunnerError {
            message: format!("Yole provisioner response missing {field}"),
        });
    }
    Ok(value)
}

impl ProvisionerContactResponse {
    fn into_contact(self) -> YoleContactInfo {
        YoleContactInfo {
            wechat_id: normalize_optional(self.wechat_id),
            wechat_qr_url: normalize_optional(self.wechat_qr_url),
            overseas: normalize_optional(self.overseas),
            top_up_message: normalize_optional(self.top_up_message),
        }
    }
}

impl ProvisionerAccountResponse {
    fn into_status(self) -> YoleAccountStatus {
        YoleAccountStatus {
            support_id: self.support_id,
            user_id: self.user_id,
            username: self.username,
            balance_usd: self.balance_usd,
            quota_points: self.quota_points,
            low_balance: self.low_balance,
            contact: self.contact.into_contact(),
        }
    }
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn random_hex(len: usize) -> Result<String> {
    let mut bytes = vec![0_u8; len];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| YoleError::Internal {
            message: "generating Yole install id failed".into(),
        })?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

fn compact_body(body: &str) -> String {
    let trimmed = body.trim().replace('\n', " ");
    if trimmed.chars().count() <= 240 {
        return trimmed;
    }
    let prefix: String = trimmed.chars().take(240).collect();
    format!("{prefix}...")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_endpoint_accepts_base_or_exact_endpoint() {
        assert_eq!(
            register_endpoint("https://provisioner.example").unwrap(),
            "https://provisioner.example/api/register"
        );
        assert_eq!(
            register_endpoint("https://provisioner.example/api/register").unwrap(),
            "https://provisioner.example/api/register"
        );
        assert_eq!(
            register_endpoint("https://provisioner.example/").unwrap(),
            "https://provisioner.example/api/register"
        );
        assert_eq!(
            register_endpoint("https://provisioner.example/yole-provisioner").unwrap(),
            "https://provisioner.example/yole-provisioner/api/register"
        );
    }

    #[test]
    fn register_endpoint_rejects_blank() {
        assert!(register_endpoint("  ").is_err());
    }

    #[test]
    fn account_status_endpoint_accepts_base_or_exact_endpoint() {
        assert_eq!(
            account_status_endpoint("https://provisioner.example").unwrap(),
            "https://provisioner.example/api/account/status"
        );
        assert_eq!(
            account_status_endpoint("https://provisioner.example/api/account/status").unwrap(),
            "https://provisioner.example/api/account/status"
        );
        assert_eq!(
            account_status_endpoint("https://provisioner.example/").unwrap(),
            "https://provisioner.example/api/account/status"
        );
    }

    #[test]
    fn register_wire_format_matches_provisioner_api() {
        let request = RegisterRequest {
            install_id: "install-1".into(),
            device_id_hash: "hash".into(),
            app_version: "0.2.7".into(),
            os: "windows".into(),
            arch: "x86_64".into(),
        };
        let value = serde_json::to_value(request).unwrap();
        assert_eq!(value["install_id"], "install-1");
        assert_eq!(value["device_id_hash"], "hash");
        assert_eq!(value["app_version"], "0.2.7");

        let response: RegisterResponse = serde_json::from_str(
            r#"{
                "newapi_base_url":"https://na.itxgp.com/v1",
                "token":"sk-test",
                "default_model":"gpt-5.5",
                "account":{
                    "account_token":"yole_acct_test",
                    "support_id":"yole-42",
                    "user_id":42,
                    "username":"yole_abcd",
                    "balance_usd":50,
                    "quota_points":25000000,
                    "low_balance":false,
                    "contact":{
                        "wechat_id":"wx-test",
                        "wechat_qr_url":"https://example.test/assets/contact/wechat-qr",
                        "overseas":"support@example.com",
                        "top_up_message":"AI 余额不足。联系客服可追加 50 美元体验额度。微信号：wx-test"
                    }
                }
            }"#,
        )
        .unwrap();
        assert_eq!(response.newapi_base_url, "https://na.itxgp.com/v1");
        assert_eq!(response.default_model, "gpt-5.5");
        assert_eq!(response.expires_at, None);
        assert_eq!(response.account.support_id, "yole-42");
        assert_eq!(response.account.balance_usd, 50.0);
        assert_eq!(response.account.quota_points, 25_000_000);
        assert_eq!(
            response.account.contact.wechat_id.as_deref(),
            Some("wx-test")
        );
    }
}

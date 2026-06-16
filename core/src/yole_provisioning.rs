use std::{collections::HashMap, time::Duration};

use ring::digest::{digest, SHA256};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};

use crate::api::{
    ManagedModelAuthKind, ManagedModelProtocol, ManagedModelProviderRecord, ManagedModelRecord,
    YoleApi,
};
use crate::credential_store;
use crate::db::{SqliteYole, UpsertManagedModelMetadata, UpsertManagedModelProviderMetadata};
use crate::error::{Result, YoleError};

const PROVIDER_ID: &str = "yole";
const MODEL_ID: &str = "yole-default";
const GPT_MODEL_ID: &str = "yole-gpt-5-5";
const PROVIDER_DISPLAY_NAME: &str = "Yole";
const MODEL_DISPLAY_NAME: &str = "DeepSeek V4 Pro";
const GPT_MODEL_DISPLAY_NAME: &str = "GPT-5.5";
const DEFAULT_TEXT_MODEL: &str = "deepseek-v4-pro";
const GPT_TEXT_MODEL: &str = "gpt-5.5";
pub const VISION_MODEL: &str = "qwen3.7-plus";
pub const IMAGE_MODEL: &str = "gpt-image-2";
const DEFAULT_PROVISIONER_URL: &str = "https://na.itxgp.com/yole-provisioner";
const PROVISIONER_URL_PREF: &str = "yole_provisioner_url";
const INSTALL_ID_PREF: &str = "yole_install_id";
const ACCOUNT_PREF: &str = "yole_account";
const ACCOUNT_TOKEN_REF: &str = "yole-account:token";
const REQUEST_TIMEOUT_SECS: u64 = 30;
const DEFAULT_POINTS_PER_USD: f64 = 100.0;
const DEFAULT_POINTS_UNIT: &str = "积分";

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

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
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
    pub balance_points: f64,
    pub initial_grant_points: f64,
    pub low_balance_points: f64,
    pub points_unit: String,
    pub low_balance: bool,
    pub contact: YoleContactInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YolePointsLedger {
    pub account: YoleAccountStatus,
    pub page: i64,
    pub page_size: i64,
    pub total: i64,
    pub items: Vec<YolePointsLedgerItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YolePointsLedgerItem {
    pub id: String,
    pub created_at: i64,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub points_delta: Option<f64>,
    pub status: String,
    #[serde(default)]
    pub request_id: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct YoleAccountMetadata {
    support_id: String,
    user_id: i64,
    username: String,
    #[serde(default)]
    balance_usd: Option<f64>,
    #[serde(default)]
    quota_points: Option<i64>,
    #[serde(default)]
    balance_points: Option<f64>,
    #[serde(default)]
    initial_grant_points: Option<f64>,
    #[serde(default)]
    low_balance_points: Option<f64>,
    #[serde(default)]
    points_unit: Option<String>,
    #[serde(default)]
    low_balance: Option<bool>,
    #[serde(default)]
    contact: Option<YoleContactInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoleModelRoute {
    #[serde(default, alias = "schema_version")]
    pub schema_version: u32,
    #[serde(default, alias = "route_version")]
    pub route_version: String,
    #[serde(default, alias = "profile_id")]
    pub profile_id: String,
    #[serde(default)]
    pub models: HashMap<String, YoleRouteModel>,
    #[serde(default)]
    pub conversation: Vec<String>,
    #[serde(default)]
    pub vision: Vec<String>,
    #[serde(default, alias = "image_generation")]
    pub image_generation: Vec<String>,
    #[serde(default, alias = "image_editing")]
    pub image_editing: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct YoleRouteModel {
    #[serde(default, alias = "display_name")]
    pub display_name: Option<String>,
    #[serde(default, alias = "input_modalities")]
    pub input_modalities: Vec<String>,
    #[serde(default, alias = "output_modalities")]
    pub output_modalities: Vec<String>,
    #[serde(default, alias = "tool_calling")]
    pub tool_calling: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
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
    model_routing: Option<YoleModelRoute>,
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
    #[serde(default)]
    balance_points: Option<f64>,
    #[serde(default)]
    initial_grant_points: Option<f64>,
    #[serde(default)]
    low_balance_points: Option<f64>,
    #[serde(default)]
    points_unit: Option<String>,
    low_balance: bool,
    contact: ProvisionerContactResponse,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ProvisionerLedgerResponse {
    account: ProvisionerAccountResponse,
    page: i64,
    page_size: i64,
    total: i64,
    items: Vec<ProvisionerLedgerItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case")]
struct ProvisionerLedgerItem {
    id: String,
    created_at: i64,
    #[serde(rename = "type")]
    kind: String,
    model: Option<String>,
    points_delta: Option<f64>,
    status: String,
    request_id: Option<String>,
    summary: Option<String>,
}

pub async fn ensure_trial_model<R: Runtime>(app: &AppHandle<R>) -> Result<YoleProvisioningResult> {
    let yole = SqliteYole::open().await?;
    let existing_models = yole.list_managed_models().await?;
    if !existing_models.is_empty() {
        ensure_existing_yole_catalog_models(&yole, &existing_models).await?;
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
            device_id_hash: device_id_hash(),
            app_version: app.package_info().version.to_string(),
            os: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
        },
    )
    .await?;

    persist_yole_model(&yole, response).await
}

async fn ensure_existing_yole_catalog_models(
    yole: &SqliteYole,
    existing_models: &[ManagedModelRecord],
) -> Result<()> {
    let Some(provider) = yole
        .list_managed_model_providers()
        .await?
        .into_iter()
        .find(|provider| provider.id == PROVIDER_ID)
    else {
        return Ok(());
    };

    let any_default = existing_models.iter().any(|model| model.is_default);
    let deepseek_default = existing_models
        .iter()
        .any(|model| model.id == MODEL_ID && model.is_default)
        || !any_default;
    let gpt_default = existing_models
        .iter()
        .any(|model| model.id == GPT_MODEL_ID && model.is_default);

    upsert_yole_text_model(
        yole,
        &provider.id,
        MODEL_ID,
        MODEL_DISPLAY_NAME,
        DEFAULT_TEXT_MODEL,
        &["text"],
        deepseek_default,
    )
    .await?;
    upsert_yole_text_model(
        yole,
        &provider.id,
        GPT_MODEL_ID,
        GPT_MODEL_DISPLAY_NAME,
        GPT_TEXT_MODEL,
        &["text", "image"],
        gpt_default,
    )
    .await?;
    Ok(())
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
    Ok(Some(DEFAULT_PROVISIONER_URL.to_string()))
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
    yole.set_pref_json(INSTALL_ID_PREF, serde_json::json!(id))
        .await?;
    Ok(id)
}

pub async fn get_account_status() -> Result<Option<YoleAccountStatus>> {
    get_account_status_with_force(false).await
}

pub async fn get_account_status_with_force(force: bool) -> Result<Option<YoleAccountStatus>> {
    let yole = SqliteYole::open().await?;
    let stored = stored_account_status(&yole).await?;
    let Some(provisioner_url) = configured_provisioner_url(&yole).await? else {
        return Ok(stored);
    };
    let account_token = match credential_store::get_secret(&yole, ACCOUNT_TOKEN_REF).await {
        Ok(token) => token,
        Err(_) => return Ok(stored),
    };
    match account_status(&provisioner_url, &account_token).await {
        Ok(response) => {
            persist_account(&yole, &response).await?;
            Ok(Some(response.into_status()))
        }
        Err(err) => {
            if force {
                return Err(err);
            }
            if stored.is_some() {
                Ok(stored)
            } else {
                Err(err)
            }
        }
    }
}

pub async fn stored_account_status_for_current_account() -> Result<Option<YoleAccountStatus>> {
    let yole = SqliteYole::open().await?;
    stored_account_status(&yole).await
}

pub async fn get_points_ledger(page: i64, page_size: i64) -> Result<YolePointsLedger> {
    let yole = SqliteYole::open().await?;
    let Some(provisioner_url) = configured_provisioner_url(&yole).await? else {
        return Err(YoleError::InvalidArgs {
            message: "Yole provisioner is not configured".into(),
        });
    };
    let account_token = credential_store::get_secret(&yole, ACCOUNT_TOKEN_REF)
        .await
        .map_err(|_| YoleError::InvalidArgs {
            message: "Yole account token is not available".into(),
        })?;
    let response = account_ledger(&provisioner_url, &account_token, page, page_size).await?;
    persist_account(&yole, &response.account).await?;
    Ok(response.into_ledger())
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
    serde_json::from_str::<ProvisionerAccountResponse>(&body).map_err(|e| YoleError::RunnerError {
        message: format!("Yole account status response is invalid JSON: {e}"),
    })
}

async fn account_ledger(
    base_url: &str,
    account_token: &str,
    page: i64,
    page_size: i64,
) -> Result<ProvisionerLedgerResponse> {
    let endpoint = account_ledger_endpoint(base_url)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .build()
        .map_err(|e| YoleError::Internal {
            message: format!("building Yole provisioner HTTP client failed: {e}"),
        })?;
    let page = page.clamp(1, 100_000).to_string();
    let page_size = page_size.clamp(1, 100).to_string();
    let resp = client
        .get(&endpoint)
        .bearer_auth(account_token)
        .query(&[("page", page.as_str()), ("page_size", page_size.as_str())])
        .send()
        .await
        .map_err(|e| YoleError::RunnerError {
            message: format!("Yole points ledger request failed: {e}"),
        })?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| YoleError::RunnerError {
        message: format!("reading Yole points ledger response failed: {e}"),
    })?;
    if !status.is_success() {
        return Err(YoleError::RunnerError {
            message: format!(
                "Yole points ledger returned HTTP {}: {}",
                status.as_u16(),
                compact_body(&body)
            ),
        });
    }
    serde_json::from_str::<ProvisionerLedgerResponse>(&body).map_err(|e| YoleError::RunnerError {
        message: format!("Yole points ledger response is invalid JSON: {e}"),
    })
}

async fn persist_yole_model(
    yole: &SqliteYole,
    response: RegisterResponse,
) -> Result<YoleProvisioningResult> {
    let api_base = nonempty(response.newapi_base_url, "newapi_base_url")?;
    let token = nonempty(response.token, "token")?;
    let _model_name = nonempty(response.default_model, "default_model")?;
    let _model_routing = response.model_routing.as_ref();
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
    let model = upsert_yole_text_model(
        yole,
        &provider.id,
        MODEL_ID,
        MODEL_DISPLAY_NAME,
        DEFAULT_TEXT_MODEL,
        &["text"],
        true,
    )
    .await?;
    upsert_yole_text_model(
        yole,
        &provider.id,
        GPT_MODEL_ID,
        GPT_MODEL_DISPLAY_NAME,
        GPT_TEXT_MODEL,
        &["text", "image"],
        false,
    )
    .await?;

    Ok(YoleProvisioningResult::Provisioned {
        provider,
        model,
        expires_at: response.expires_at,
        account: response.account.into_status(),
    })
}

async fn upsert_yole_text_model(
    yole: &SqliteYole,
    provider_id: &str,
    id: &str,
    display_name: &str,
    model: &str,
    input_modalities: &[&str],
    make_default: bool,
) -> Result<ManagedModelRecord> {
    yole.upsert_managed_model_metadata(UpsertManagedModelMetadata {
        id: id.into(),
        provider_id: provider_id.into(),
        display_name: display_name.into(),
        model: model.into(),
        advanced_options: yole_text_model_advanced_options(input_modalities),
        make_default,
    })
    .await
}

fn yole_text_model_advanced_options(input_modalities: &[&str]) -> serde_json::Value {
    let mut options = crate::managed_model_advanced_defaults(ManagedModelProtocol::Openai);
    if let Some(map) = options.as_object_mut() {
        map.insert(
            "input_modalities".into(),
            serde_json::json!(input_modalities),
        );
        map.insert("output_modalities".into(), serde_json::json!(["text"]));
        map.insert("tool_calling".into(), serde_json::json!(true));
    }
    options
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
        balance_usd: Some(account.balance_usd),
        quota_points: Some(account.quota_points),
        balance_points: Some(account.balance_points()),
        initial_grant_points: Some(account.initial_grant_points()),
        low_balance_points: Some(account.low_balance_points()),
        points_unit: Some(account.points_unit()),
        low_balance: Some(account.low_balance),
        contact: Some(account.contact.clone().into_contact()),
    };
    yole.set_pref_json(
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
    let Some(balance_usd) = metadata.balance_usd else {
        return Ok(None);
    };
    Ok(Some(YoleAccountStatus {
        support_id: metadata.support_id,
        user_id: metadata.user_id,
        username: metadata.username,
        balance_usd,
        quota_points: metadata.quota_points.unwrap_or_default(),
        balance_points: metadata
            .balance_points
            .unwrap_or_else(|| points_from_usd(balance_usd)),
        initial_grant_points: metadata
            .initial_grant_points
            .unwrap_or_else(|| points_from_usd(30.0)),
        low_balance_points: metadata
            .low_balance_points
            .unwrap_or_else(|| points_from_usd(3.0)),
        points_unit: metadata
            .points_unit
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_POINTS_UNIT.into()),
        low_balance: metadata.low_balance.unwrap_or(false),
        contact: metadata.contact.unwrap_or_default(),
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

fn account_ledger_endpoint(base_url: &str) -> Result<String> {
    let trimmed = base_url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(YoleError::InvalidArgs {
            message: "Yole provisioner URL is empty".into(),
        });
    }
    if trimmed.ends_with("/api/account/ledger") {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("{trimmed}/api/account/ledger"))
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

impl ProvisionerLedgerResponse {
    fn into_ledger(self) -> YolePointsLedger {
        YolePointsLedger {
            account: self.account.into_status(),
            page: self.page,
            page_size: self.page_size,
            total: self.total,
            items: self
                .items
                .into_iter()
                .map(ProvisionerLedgerItem::into_item)
                .collect(),
        }
    }
}

impl ProvisionerLedgerItem {
    fn into_item(self) -> YolePointsLedgerItem {
        YolePointsLedgerItem {
            id: self.id,
            created_at: self.created_at,
            kind: self.kind,
            model: normalize_optional(self.model),
            points_delta: self.points_delta,
            status: self.status,
            request_id: normalize_optional(self.request_id),
            summary: normalize_optional(self.summary),
        }
    }
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
        let balance_points = self.balance_points();
        let initial_grant_points = self.initial_grant_points();
        let low_balance_points = self.low_balance_points();
        let points_unit = self.points_unit();
        YoleAccountStatus {
            support_id: self.support_id,
            user_id: self.user_id,
            username: self.username,
            balance_usd: self.balance_usd,
            quota_points: self.quota_points,
            balance_points,
            initial_grant_points,
            low_balance_points,
            points_unit,
            low_balance: self.low_balance,
            contact: self.contact.into_contact(),
        }
    }

    fn balance_points(&self) -> f64 {
        self.balance_points
            .unwrap_or_else(|| points_from_usd(self.balance_usd))
    }

    fn initial_grant_points(&self) -> f64 {
        self.initial_grant_points
            .unwrap_or_else(|| points_from_usd(30.0))
    }

    fn low_balance_points(&self) -> f64 {
        self.low_balance_points
            .unwrap_or_else(|| points_from_usd(3.0))
    }

    fn points_unit(&self) -> String {
        self.points_unit
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(DEFAULT_POINTS_UNIT)
            .to_string()
    }
}

fn normalize_optional(value: Option<String>) -> Option<String> {
    value
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn points_from_usd(usd: f64) -> f64 {
    if usd <= 0.0 {
        return 0.0;
    }
    (usd * DEFAULT_POINTS_PER_USD * 10.0).round() / 10.0
}

fn default_true() -> bool {
    true
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

fn device_id_hash() -> String {
    let Some(source) = device_id_source() else {
        return String::new();
    };
    sha256_hex(format!("yole-device-v1|{}|{source}", std::env::consts::OS).as_bytes())
}

fn sha256_hex(bytes: &[u8]) -> String {
    digest(&SHA256, bytes)
        .as_ref()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

#[cfg(target_os = "windows")]
fn device_id_source() -> Option<String> {
    let output = std::process::Command::new("reg")
        .args([
            "query",
            r"HKLM\SOFTWARE\Microsoft\Cryptography",
            "/v",
            "MachineGuid",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_windows_machine_guid(&String::from_utf8_lossy(&output.stdout))
        .map(|guid| format!("machine-guid:{guid}"))
}

#[cfg(not(target_os = "windows"))]
#[cfg(target_os = "macos")]
fn device_id_source() -> Option<String> {
    let output = std::process::Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_macos_platform_uuid(&String::from_utf8_lossy(&output.stdout))
        .map(|uuid| format!("io-platform-uuid:{uuid}"))
}

#[cfg(target_os = "linux")]
fn device_id_source() -> Option<String> {
    read_first_nonempty_path(&[
        "/etc/machine-id",
        "/var/lib/dbus/machine-id",
        "/sys/class/dmi/id/product_uuid",
    ])
    .map(|id| format!("linux-machine-id:{id}"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn device_id_source() -> Option<String> {
    None
}

#[cfg(any(target_os = "linux", test))]
fn read_first_nonempty_path(paths: &[&str]) -> Option<String> {
    paths.iter().find_map(|path| {
        std::fs::read_to_string(path)
            .ok()
            .map(|value| value.trim().to_ascii_lowercase())
            .filter(|value| !value.is_empty())
    })
}

#[cfg(any(target_os = "windows", test))]
fn parse_windows_machine_guid(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let trimmed = line.trim();
        if !trimmed.to_ascii_lowercase().starts_with("machineguid") {
            return None;
        }
        let mut parts = trimmed.split_whitespace();
        let _name = parts.next()?;
        let _kind = parts.next()?;
        parts.next().map(|value| value.trim().to_ascii_lowercase())
    })
}

#[cfg(any(target_os = "macos", test))]
fn parse_macos_platform_uuid(output: &str) -> Option<String> {
    output.lines().find_map(|line| {
        let trimmed = line.trim();
        if !trimmed.contains("\"IOPlatformUUID\"") {
            return None;
        }
        trimmed
            .split_once('=')
            .map(|(_, value)| value.trim().trim_matches('"').to_ascii_lowercase())
            .filter(|value| !value.is_empty())
    })
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
    fn account_ledger_endpoint_accepts_base_or_exact_endpoint() {
        assert_eq!(
            account_ledger_endpoint("https://provisioner.example").unwrap(),
            "https://provisioner.example/api/account/ledger"
        );
        assert_eq!(
            account_ledger_endpoint("https://provisioner.example/api/account/ledger").unwrap(),
            "https://provisioner.example/api/account/ledger"
        );
        assert_eq!(
            account_ledger_endpoint("https://provisioner.example/yole-provisioner").unwrap(),
            "https://provisioner.example/yole-provisioner/api/account/ledger"
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
                "default_model":"deepseek-v4-pro",
                "route_version":"2026-06-14.1",
                "model_routing":{
                    "schema_version":1,
                    "route_version":"2026-06-14.1",
                    "profile_id":"yole_standard",
                    "models":{
                        "deepseek-v4-pro":{
                            "input_modalities":["text"],
                            "output_modalities":["text"],
                            "tool_calling":true,
                            "enabled":true
                        }
                    },
                    "conversation":["deepseek-v4-pro","gpt-5.5"],
                    "vision":[],
                    "image_generation":["gpt-image-2"],
                    "image_editing":["gpt-image-2"]
                },
                "account":{
                    "account_token":"yole_acct_test",
                    "support_id":"yole-42",
                    "user_id":42,
                    "username":"yole_abcd",
                    "balance_usd":30,
                    "quota_points":15000000,
                    "balance_points":3000,
                    "initial_grant_points":3000,
                    "low_balance_points":300,
                    "points_unit":"积分",
                    "low_balance":false,
                    "contact":{
                        "wechat_id":"wx-test",
                        "wechat_qr_url":"https://example.test/assets/contact/wechat-qr",
                        "overseas":"support@example.com",
                        "top_up_message":"AI 积分不足。联系客服可追加 3000 积分体验额度。微信号：wx-test"
                    }
                }
            }"#,
        )
        .unwrap();
        assert_eq!(response.newapi_base_url, "https://na.itxgp.com/v1");
        assert_eq!(response.default_model, "deepseek-v4-pro");
        assert_eq!(response.expires_at, None);
        assert_eq!(response.account.support_id, "yole-42");
        assert_eq!(response.account.balance_usd, 30.0);
        assert_eq!(response.account.quota_points, 15_000_000);
        assert_eq!(response.account.balance_points(), 3000.0);
        assert_eq!(response.account.low_balance_points(), 300.0);
        assert_eq!(
            response
                .model_routing
                .as_ref()
                .and_then(|route| route.conversation.first())
                .map(String::as_str),
            Some("deepseek-v4-pro")
        );
        assert_eq!(
            response.account.contact.wechat_id.as_deref(),
            Some("wx-test")
        );
    }

    #[test]
    fn ledger_wire_format_matches_provisioner_api() {
        let response: ProvisionerLedgerResponse = serde_json::from_str(
            r#"{
                "account":{
                    "support_id":"yole-42",
                    "user_id":42,
                    "username":"yole_abcd",
                    "balance_usd":28.75,
                    "quota_points":14375000,
                    "balance_points":2875,
                    "initial_grant_points":3000,
                    "low_balance_points":300,
                    "points_unit":"绉垎",
                    "low_balance":false,
                    "contact":{}
                },
                "page":1,
                "page_size":20,
                "total":1,
                "items":[{
                    "id":"101",
                    "created_at":1710000000,
                    "type":"consume",
                    "model":"gpt-5.5",
                    "points_delta":-125,
                    "status":"success",
                    "request_id":"req_1",
                    "summary":"consume"
                }]
            }"#,
        )
        .unwrap();
        let ledger = response.into_ledger();
        assert_eq!(ledger.account.balance_points, 2875.0);
        assert_eq!(ledger.total, 1);
        assert_eq!(ledger.items[0].kind, "consume");
        assert_eq!(ledger.items[0].points_delta, Some(-125.0));
        assert_eq!(ledger.items[0].request_id.as_deref(), Some("req_1"));
    }

    #[test]
    fn device_hash_uses_sha256_hex() {
        let hash = sha256_hex(b"yole-device-v1|windows|machine-guid:test-guid");
        assert_eq!(hash.len(), 64);
        assert_eq!(
            hash,
            "2c72664729bc9c4f8fc8d2fee0adb8ea18b6ec76c5726b5cd89e858156fe6b39"
        );
    }

    #[test]
    fn parses_windows_machine_guid_from_reg_output() {
        let output = r#"
HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Cryptography
    MachineGuid    REG_SZ    00112233-4455-6677-8899-aabbccddeeff
"#;
        assert_eq!(
            parse_windows_machine_guid(output).as_deref(),
            Some("00112233-4455-6677-8899-aabbccddeeff")
        );
    }

    #[test]
    fn parses_macos_platform_uuid_from_ioreg_output() {
        let output = r#"
    | |   "IOPlatformUUID" = "A1B2C3D4-E5F6-7788-9900-AABBCCDDEEFF"
"#;
        assert_eq!(
            parse_macos_platform_uuid(output).as_deref(),
            Some("a1b2c3d4-e5f6-7788-9900-aabbccddeeff")
        );
    }

    #[test]
    fn read_first_nonempty_path_skips_blank_files() {
        let dir = tempfile::TempDir::new().unwrap();
        let blank = dir.path().join("blank");
        let id = dir.path().join("machine-id");
        std::fs::write(&blank, "\n").unwrap();
        std::fs::write(&id, "ABCDEF\n").unwrap();
        let blank = blank.to_string_lossy().to_string();
        let id = id.to_string_lossy().to_string();

        assert_eq!(
            read_first_nonempty_path(&[&blank, &id]).as_deref(),
            Some("abcdef")
        );
    }
}

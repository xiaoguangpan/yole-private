//! Galley-managed IM Supervisor process management.
//!
//! Phase 1 supports WeChat. The process is Galley-owned managed runtime state,
//! not an external GenericAgent checkout.

use crate::api::GalleyApi;
use crate::db::SqliteGalley;
use crate::managed_prompt;
use crate::managed_runtime;
use crate::process_command;
use crate::runner_commands::prepare_managed_runtime_context;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

const EVENT_NAME: &str = "im-supervisor-updated";
const WECHAT: &str = "wechat";
const WECHAT_PREF: &str = "im_supervisor_wechat";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImSupervisorState {
    NotConnected,
    Starting,
    WaitingScan,
    Running,
    Expired,
    Error,
    Stopped,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImSupervisorStatus {
    pub platform: String,
    pub state: ImSupervisorState,
    pub enabled: bool,
    pub pid: Option<u32>,
    pub bot_id: Option<String>,
    pub qr_image_path: Option<String>,
    pub last_error: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ImSupervisorPref {
    enabled: bool,
    auto_start: bool,
}

struct ProcessSlot {
    child: Option<Arc<Mutex<Child>>>,
    status: ImSupervisorStatus,
}

#[derive(Default)]
pub struct ImSupervisorManager {
    slots: Mutex<HashMap<String, ProcessSlot>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImSupervisorLine {
    platform: Option<String>,
    state: ImSupervisorState,
    bot_id: Option<String>,
    qr_image_path: Option<String>,
    last_error: Option<String>,
    updated_at: Option<String>,
}

impl ImSupervisorManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn status(
        &self,
        app: &AppHandle,
        platform: String,
    ) -> Result<ImSupervisorStatus, String> {
        let platform = normalize_platform(&platform)?;
        if let Some(status) = self.current_status(platform).await {
            let pref = read_pref().await;
            return Ok(ImSupervisorStatus {
                enabled: pref.enabled,
                ..status
            });
        }
        self.derived_status(app, platform).await
    }

    pub async fn start(
        self: &Arc<Self>,
        app: AppHandle,
        platform: String,
        relogin: bool,
    ) -> Result<ImSupervisorStatus, String> {
        let platform = normalize_platform(&platform)?;
        if let Some(status) = self.current_status(platform).await {
            if matches!(
                status.state,
                ImSupervisorState::Starting
                    | ImSupervisorState::WaitingScan
                    | ImSupervisorState::Running
            ) {
                if !relogin {
                    return Ok(status);
                }
                if let Some(child) = self.take_child(platform).await {
                    let _ = child.lock().await.start_kill();
                }
            }
        }

        write_pref(ImSupervisorPref {
            enabled: true,
            auto_start: true,
        })
        .await?;

        let context = prepare_managed_runtime_context(&app, None)
            .await
            .map_err(|e| e.to_string())?;
        let state_root = PathBuf::from(&context.diagnostics.paths.state_root);
        let state_dir = state_root.join("im").join(platform);
        let sop_path = materialize_sop_reference(&state_root).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&state_dir).map_err(|e| e.to_string())?;
        remove_wechat_qr_files(&state_dir);
        if relogin {
            let _ = std::fs::remove_file(state_dir.join("token.json"));
        }

        let mut env = context.env;
        let sop_path_str = sop_path.to_string_lossy().into_owned();
        env.push((
            "GALLEY_IM_SUPERVISOR_PROMPT_TEXT".into(),
            managed_prompt::im_supervisor_prompt(&sop_path_str),
        ));
        env.push(("GALLEY_SUPERVISOR_SOP_PATH".into(), sop_path_str));
        env.push(("GALLEY_IM_PLATFORM".into(), platform.into()));

        let python = managed_python_for_app(&app)?;
        let code_root = context.diagnostics.paths.code_root.clone();
        let state_dir_arg = state_dir.to_string_lossy().into_owned();
        let sop_path_arg = sop_path.to_string_lossy().into_owned();
        let mut cmd = Command::new(&python);
        cmd.args([
            "-m",
            "runner.managed_im_supervisor",
            "--platform",
            platform,
            "--ga-path",
            &code_root,
            "--state-dir",
            &state_dir_arg,
            "--sop-path",
            &sop_path_arg,
        ]);
        if relogin {
            cmd.arg("--relogin");
        }
        for (k, v) in env {
            cmd.env(k, v);
        }
        process_command::configure_python(&mut cmd);
        let mut child = cmd
            .current_dir(context.bridge_cwd)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("starting managed IM supervisor failed: {e}"))?;
        let pid = child.id();
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();
        let child = Arc::new(Mutex::new(child));

        let status = ImSupervisorStatus {
            platform: platform.into(),
            state: ImSupervisorState::Starting,
            enabled: true,
            pid,
            bot_id: None,
            qr_image_path: None,
            last_error: None,
            updated_at: now_iso(),
        };
        self.set_slot(platform, Some(child.clone()), status.clone(), &app)
            .await;

        if let Some(stdout) = stdout {
            let manager = Arc::clone(self);
            let app_for_task = app.clone();
            tauri::async_runtime::spawn(async move {
                manager
                    .read_stdout(app_for_task, platform, pid, stdout)
                    .await;
            });
        }
        if let Some(stderr) = stderr {
            let manager = Arc::clone(self);
            let app_for_task = app.clone();
            tauri::async_runtime::spawn(async move {
                manager
                    .read_stderr(app_for_task, platform, pid, stderr)
                    .await;
            });
        }
        {
            let manager = Arc::clone(self);
            tauri::async_runtime::spawn(async move {
                manager.wait_child(app, platform, pid, child).await;
            });
        }
        Ok(status)
    }

    pub async fn stop(
        &self,
        app: AppHandle,
        platform: String,
    ) -> Result<ImSupervisorStatus, String> {
        let platform = normalize_platform(&platform)?;
        write_pref(ImSupervisorPref {
            enabled: false,
            auto_start: false,
        })
        .await?;
        let child = {
            let mut slots = self.slots.lock().await;
            let Some(slot) = slots.get_mut(platform) else {
                return self.derived_status(&app, platform).await;
            };
            slot.child.clone()
        };
        if let Some(child) = child {
            let _ = child.lock().await.start_kill();
        }
        let status = ImSupervisorStatus {
            platform: platform.into(),
            state: ImSupervisorState::Stopped,
            enabled: false,
            pid: None,
            bot_id: None,
            qr_image_path: self.qr_path(&app, platform).await,
            last_error: None,
            updated_at: now_iso(),
        };
        self.set_slot(platform, None, status.clone(), &app).await;
        Ok(status)
    }

    pub async fn logout(
        &self,
        app: AppHandle,
        platform: String,
    ) -> Result<ImSupervisorStatus, String> {
        let platform = normalize_platform(&platform)?;
        let _ = self.stop(app.clone(), platform.into()).await;
        write_pref(ImSupervisorPref {
            enabled: false,
            auto_start: false,
        })
        .await?;
        if let Ok(state_dir) = wechat_state_dir(&app) {
            let _ = std::fs::remove_file(state_dir.join("token.json"));
            remove_wechat_qr_files(&state_dir);
        }
        let status = ImSupervisorStatus {
            platform: platform.into(),
            state: ImSupervisorState::NotConnected,
            enabled: false,
            pid: None,
            bot_id: None,
            qr_image_path: None,
            last_error: None,
            updated_at: now_iso(),
        };
        self.set_slot(platform, None, status.clone(), &app).await;
        Ok(status)
    }

    pub async fn autostart(self: Arc<Self>, app: AppHandle) {
        let pref = read_pref().await;
        if pref.enabled && pref.auto_start {
            let _ = self.start(app, WECHAT.into(), false).await;
        }
    }

    pub async fn stop_all(&self) {
        let children = {
            let slots = self.slots.lock().await;
            slots
                .values()
                .filter_map(|slot| slot.child.clone())
                .collect::<Vec<_>>()
        };
        for child in children {
            let _ = child.lock().await.start_kill();
        }
    }

    async fn current_status(&self, platform: &str) -> Option<ImSupervisorStatus> {
        let slots = self.slots.lock().await;
        slots.get(platform).map(|slot| slot.status.clone())
    }

    async fn take_child(&self, platform: &str) -> Option<Arc<Mutex<Child>>> {
        let mut slots = self.slots.lock().await;
        slots.get_mut(platform).and_then(|slot| slot.child.take())
    }

    async fn set_slot(
        &self,
        platform: &str,
        child: Option<Arc<Mutex<Child>>>,
        status: ImSupervisorStatus,
        app: &AppHandle,
    ) {
        let mut slots = self.slots.lock().await;
        slots.insert(
            platform.into(),
            ProcessSlot {
                child,
                status: status.clone(),
            },
        );
        let _ = app.emit(EVENT_NAME, status);
    }

    async fn read_stdout(
        self: Arc<Self>,
        app: AppHandle,
        platform: &'static str,
        pid: Option<u32>,
        stdout: tokio::process::ChildStdout,
    ) {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let Ok(event) = serde_json::from_str::<ImSupervisorLine>(&line) else {
                continue;
            };
            let event_platform = event.platform.as_deref().unwrap_or(platform);
            if event_platform != platform {
                continue;
            }
            let mut slots = self.slots.lock().await;
            let Some(slot) = slots.get_mut(platform) else {
                continue;
            };
            if slot.status.pid != pid {
                continue;
            }
            slot.status.state = event.state;
            slot.status.updated_at = event.updated_at.unwrap_or_else(now_iso);
            slot.status.bot_id = event.bot_id.or_else(|| slot.status.bot_id.clone());
            if let Some(qr) = event.qr_image_path {
                slot.status.qr_image_path = Some(qr);
            }
            if let Some(err) = event.last_error {
                slot.status.last_error = Some(err);
            } else if slot.status.state != ImSupervisorState::Error {
                slot.status.last_error = None;
            }
            let status = slot.status.clone();
            drop(slots);
            let _ = app.emit(EVENT_NAME, status);
        }
    }

    async fn read_stderr(
        self: Arc<Self>,
        app: AppHandle,
        platform: &'static str,
        pid: Option<u32>,
        stderr: tokio::process::ChildStderr,
    ) {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            self.update_error(&app, platform, pid, line.to_string())
                .await;
        }
    }

    async fn wait_child(
        self: Arc<Self>,
        app: AppHandle,
        platform: &'static str,
        pid: Option<u32>,
        child: Arc<Mutex<Child>>,
    ) {
        let status = loop {
            let status = {
                let mut child = child.lock().await;
                child.try_wait()
            };
            match status {
                Ok(Some(exit)) => break Ok(exit),
                Ok(None) => sleep(Duration::from_millis(250)).await,
                Err(e) => break Err(e),
            }
        };
        let mut slots = self.slots.lock().await;
        let Some(slot) = slots.get_mut(platform) else {
            return;
        };
        if slot.status.pid != pid {
            return;
        }
        slot.child = None;
        slot.status.pid = None;
        match slot.status.state {
            ImSupervisorState::Expired | ImSupervisorState::Error | ImSupervisorState::Stopped => {}
            _ => match status {
                Ok(exit) if exit.success() => slot.status.state = ImSupervisorState::Stopped,
                Ok(exit) => {
                    slot.status.state = ImSupervisorState::Error;
                    slot.status.last_error = Some(format!("process exited with {exit}"));
                }
                Err(e) => {
                    slot.status.state = ImSupervisorState::Error;
                    slot.status.last_error = Some(format!("process wait failed: {e}"));
                }
            },
        }
        slot.status.updated_at = now_iso();
        let status = slot.status.clone();
        drop(slots);
        let _ = app.emit(EVENT_NAME, status);
    }

    async fn update_error(
        &self,
        app: &AppHandle,
        platform: &'static str,
        pid: Option<u32>,
        error: String,
    ) {
        let mut slots = self.slots.lock().await;
        let Some(slot) = slots.get_mut(platform) else {
            return;
        };
        if slot.status.pid != pid {
            return;
        }
        slot.status.last_error = Some(error);
        slot.status.updated_at = now_iso();
        let status = slot.status.clone();
        drop(slots);
        let _ = app.emit(EVENT_NAME, status);
    }

    async fn derived_status(
        &self,
        app: &AppHandle,
        platform: &'static str,
    ) -> Result<ImSupervisorStatus, String> {
        let pref = read_pref().await;
        let state_dir = wechat_state_dir(app)?;
        let token_exists = state_dir.join("token.json").is_file();
        let qr_path = latest_wechat_qr_path(&state_dir);
        Ok(ImSupervisorStatus {
            platform: platform.into(),
            state: if token_exists {
                ImSupervisorState::Stopped
            } else {
                ImSupervisorState::NotConnected
            },
            enabled: pref.enabled,
            pid: None,
            bot_id: None,
            qr_image_path: qr_path.map(|path| path.to_string_lossy().into_owned()),
            last_error: None,
            updated_at: now_iso(),
        })
    }

    async fn qr_path(&self, app: &AppHandle, platform: &'static str) -> Option<String> {
        if platform != WECHAT {
            return None;
        }
        latest_wechat_qr_path(&wechat_state_dir(app).ok()?)
            .map(|path| path.to_string_lossy().into_owned())
    }
}

fn remove_wechat_qr_files(state_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(state_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if name.starts_with("wx_qr") && name.ends_with(".png") {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn latest_wechat_qr_path(state_dir: &Path) -> Option<PathBuf> {
    std::fs::read_dir(state_dir)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| name.starts_with("wx_qr") && name.ends_with(".png"))
        })
        .max_by_key(|path| {
            std::fs::metadata(path)
                .and_then(|metadata| metadata.modified())
                .ok()
        })
}

fn normalize_platform(platform: &str) -> Result<&'static str, String> {
    match platform.trim().to_ascii_lowercase().as_str() {
        WECHAT => Ok(WECHAT),
        other => Err(format!("unsupported IM platform: {other}")),
    }
}

async fn read_pref() -> ImSupervisorPref {
    let Ok(galley) = SqliteGalley::open().await else {
        return ImSupervisorPref::default();
    };
    let Ok(Some(value)) = galley.get_pref_json(WECHAT_PREF).await else {
        return ImSupervisorPref::default();
    };
    serde_json::from_value(value).unwrap_or_default()
}

async fn write_pref(pref: ImSupervisorPref) -> Result<(), String> {
    let galley = SqliteGalley::open().await.map_err(|e| e.to_string())?;
    galley
        .set_pref_json(WECHAT_PREF, json!(pref))
        .await
        .map_err(|e| e.to_string())
}

fn materialize_sop_reference(state_root: &Path) -> std::io::Result<PathBuf> {
    let dir = state_root.join("im").join("reference");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("galley-supervisor-sop.md");
    std::fs::write(&path, crate::sop_install::sop_body())?;
    Ok(path)
}

fn wechat_state_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let diagnostics = managed_runtime::ensure_for_app(app).map_err(|e| e.to_string())?;
    Ok(PathBuf::from(diagnostics.paths.state_root)
        .join("im")
        .join(WECHAT))
}

fn managed_python_for_app(app: &AppHandle) -> Result<String, String> {
    if cfg!(debug_assertions) {
        return Ok(if cfg!(target_os = "windows") {
            "python".into()
        } else {
            "python3".into()
        });
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resolving resource dir failed: {e}"))?;
    let python = if cfg!(target_os = "windows") {
        resource_dir.join("python").join("python.exe")
    } else {
        resource_dir.join("python").join("bin").join("python3")
    };
    Ok(python.to_string_lossy().into_owned())
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_platform_accepts_wechat_only() {
        assert_eq!(normalize_platform("wechat").unwrap(), WECHAT);
        assert_eq!(normalize_platform(" WeChat ").unwrap(), WECHAT);
        assert!(normalize_platform("telegram").is_err());
    }

    #[test]
    fn materialize_sop_reference_writes_galley_owned_copy() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let path = materialize_sop_reference(tmp.path()).expect("write sop reference");
        assert!(path.ends_with("im/reference/galley-supervisor-sop.md"));
        let body = std::fs::read_to_string(path).expect("read sop");
        assert!(body.contains("Galley Supervisor SOP"));
    }
}

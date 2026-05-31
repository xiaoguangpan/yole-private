import { invoke } from "@tauri-apps/api/core";

export type ImSupervisorState =
  | "not_connected"
  | "starting"
  | "waiting_scan"
  | "running"
  | "expired"
  | "error"
  | "stopped";

export interface ImSupervisorStatus {
  platform: "wechat";
  state: ImSupervisorState;
  enabled: boolean;
  pid?: number | null;
  botId?: string | null;
  qrImagePath?: string | null;
  lastError?: string | null;
  modelConfigRevision?: string | null;
  modelConfigStale: boolean;
  updatedAt: string;
}

export function getImSupervisorStatus(platform: "wechat") {
  return invoke<ImSupervisorStatus>("get_im_supervisor_status", { platform });
}

export function startImSupervisor(platform: "wechat", relogin = false) {
  return invoke<ImSupervisorStatus>("start_im_supervisor", {
    platform,
    relogin,
  });
}

export function stopImSupervisor(platform: "wechat") {
  return invoke<ImSupervisorStatus>("stop_im_supervisor", { platform });
}

export function logoutImSupervisor(platform: "wechat") {
  return invoke<ImSupervisorStatus>("logout_im_supervisor", { platform });
}

export function restartEnabledImSupervisors() {
  return invoke<ImSupervisorStatus[]>("restart_enabled_im_supervisors");
}

import { invoke } from "@tauri-apps/api/core";

export type BrowserControlProbeStatus =
  | "connected"
  | "not_connected"
  | "error";

export type BrowserControlStatus =
  | "unknown"
  | "not_connected"
  | "connected"
  | "error";

export type BrowserControlBrowser = "chrome" | "edge";

export interface BrowserControlLayout {
  extensionDir: string;
  sourceDir: string;
  manifestVersion: string;
  filesCopied: number;
}

export interface BrowserControlProbe {
  status: BrowserControlProbeStatus;
  extensionDir: string;
  manifestVersion: string;
  tabCount: number;
  sampleTitle?: string | null;
  message?: string | null;
}

export function ensureBrowserControlLayout(): Promise<BrowserControlLayout> {
  return invoke<BrowserControlLayout>("ensure_browser_control_layout");
}

export function probeBrowserControl(): Promise<BrowserControlProbe> {
  return invoke<BrowserControlProbe>("probe_browser_control");
}

export function openBrowserControlExtensionsPage(
  browser: BrowserControlBrowser,
): Promise<void> {
  return invoke("open_browser_control_extensions_page", { browser });
}

export type SettingsTab =
  | "runtime"
  | "points"
  | "models"
  | "approval"
  | "integration"
  | "im"
  | "shortcuts"
  | "about";

export interface ApprovalConfig {
  /** Tools that require approval before dispatch. */
  requiredTools: string[];
  /** Per-project always-allow rules (current project). */
  alwaysAllowProject: string[];
  /** Global always-allow rules. */
  alwaysAllowGlobal: string[];
}

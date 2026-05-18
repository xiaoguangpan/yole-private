use serde::{Deserialize, Serialize};

/// Opaque project identifier.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ProjectId(pub String);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBrief {
    pub id: ProjectId,
    pub name: String,
    /// Historical bound cwd. Preserved on the DB row for forward
    /// compatibility but no longer injected at runner spawn — see devlog
    /// 2026-05-14 (rolled back to avoid breaking GA's relative
    /// `./memory/...` reads).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub root_path: Option<String>,
    /// Default emoji: 📁.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub pinned: bool,
    /// max(sessions.lastActivityAt where projectId = this.id) — falls
    /// back to created_at when the project has no session yet.
    pub last_activity_at: String,
    pub created_at: String,
    pub updated_at: String,
}

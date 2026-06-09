use serde::{Deserialize, Serialize};

/// Status of one health probe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HealthStatus {
    /// Pass.
    Ok,
    /// Warning — degraded but Yole can fall back.
    Warn,
    /// Hard failure — the probed dependency is unavailable.
    Fail,
    /// B1 SQLite-only health implementation can't actually probe this
    /// (e.g. spawning Python to validate GA imports). Real probe lands
    /// in B4 daemon stage.
    DeferredB4,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheck {
    /// Stable identifier — `"ga_path"`, `"mykey_py"`, etc. Agents should
    /// pattern-match on this, not the human-readable label.
    pub id: String,
    pub status: HealthStatus,
    /// One-line human-readable detail (path, error message, etc.).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Aggregate health report. B1 surfaces a partial set; B4 fills in the
/// Python-dependent probes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthReport {
    pub checks: Vec<HealthCheck>,
}

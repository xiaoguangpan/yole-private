use serde::{Deserialize, Serialize};

/// How a session command was triggered. Per PRD §8.3 — Galley records
/// this on every write so audit logs can distinguish human and agent
/// actions even after the fact.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OriginVia {
    /// Human-triggered through the GUI.
    Manual,
    /// Agent-triggered through Galley CLI.
    Cli,
}

/// Metadata about the source of a command. Required on every B2+ write;
/// optional on the read APIs in B1.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Origin {
    pub via: OriginVia,
    /// Free-text supervisor identifier when via=Cli ("ga-claude-1",
    /// "user@local"). None for manual.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supervisor: Option<String>,
    /// One-line reason from the agent for the action — surfaces in
    /// audit / log views.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

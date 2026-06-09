use serde::{Deserialize, Serialize};

/// Snapshot of aggregate session counts. Returned by
/// [`crate::api::YoleApi::status`] for quick dashboard / CLI summary.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusSummary {
    pub total: u32,
    pub running: u32,
    /// Sessions where the agent called `ask_user` and is paused.
    pub waiting_input: u32,
    pub errored: u32,
}

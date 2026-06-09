use serde::{Deserialize, Serialize};

/// Errors surfaced from the Yole Core API. Mapped 1-1 to the CLI exit
/// code categories per playbook T4.11 / agent-api.md (B1 M5).
///
/// Wire shape (B4 M6 freeze): `{"error": "<tag>", "message": "..."}` —
/// `error` is the stable discriminant, `message` is the human-readable
/// explanation. Matches the socket transport envelope so SOPs parse one
/// shape across both transports. A future v1-additive `detail` field
/// can carry structured context (session_id, path, expected, ...)
/// without breaking parsers that already pattern-match on `error`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "error", rename_all = "snake_case")]
pub enum YoleError {
    /// Resource not found (session id / message id / project id missing).
    /// CLI exit code 3.
    NotFound { message: String },
    /// Argument validation failure. CLI exit code 2.
    InvalidArgs { message: String },
    /// Database / backend unavailable. CLI exit code 4.
    DbUnavailable { message: String },
    /// Runner subprocess unreachable / IPC dispatch failed after persist
    /// succeeded (e.g. `session btw` with no live bridge, or `llm set`
    /// emit failed mid-flight). CLI exit code 5 (B4 M1; PRD §11.2 #3).
    RunnerError { message: String },
    /// Catch-all for unexpected internal failures. CLI exit code 1.
    Internal { message: String },
}

impl std::fmt::Display for YoleError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            YoleError::NotFound { message } => write!(f, "not_found: {message}"),
            YoleError::InvalidArgs { message } => write!(f, "invalid_args: {message}"),
            YoleError::DbUnavailable { message } => write!(f, "db_unavailable: {message}"),
            YoleError::RunnerError { message } => write!(f, "runner_error: {message}"),
            YoleError::Internal { message } => write!(f, "internal: {message}"),
        }
    }
}

impl std::error::Error for YoleError {}

/// Convenience alias used by the trait + db module.
pub type Result<T> = std::result::Result<T, YoleError>;

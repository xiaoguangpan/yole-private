//! Install the Galley Supervisor SOP into the user's GenericAgent
//! `memory/` directory.
//!
//! ## Why this lives in Galley
//!
//! GA bot frontends (WeChat / Feishu / Telegram users running GA) act
//! as Galley supervisors when their human asks them to drive Galley.
//! The behavior contract — how to read the discovery file, which CLI
//! commands to use, when to confirm destructive ops, how to fill
//! `--supervisor=` / `--reason=` — lives in
//! `docs/integrations/galley-supervisor-sop.md`. GA reads files in its
//! `memory/` folder at startup and treats them as system-prompt
//! addenda; dropping the SOP there makes any GA instance auto-aware of
//! Galley.
//!
//! ## CLAUDE.md non-invasive exception
//!
//! Per CLAUDE.md "关于读取（read-only）" + the SOP-install exception
//! clause: Galley normally cannot write to GA's directory tree. The
//! exception permits writing *one specific file* at *one fixed path*
//! when the user explicitly triggers it from the GUI. This module
//! enforces both constraints — the destination is hard-coded to
//! `<ga_path>/memory/galley-supervisor-sop.md`, no caller-controlled
//! path component.
//!
//! ## Caller contract
//!
//! - `ga_path` comes from `prefs.gaConfig.gaPath` (the user's chosen
//!   GenericAgent checkout). The caller is responsible for ensuring
//!   it's an absolute path the user picked through the OS picker.
//! - `overwrite=false` returns `AlreadyExists` if the file exists at
//!   the target; the GUI shows a "保留 / 覆盖 / 取消" confirm and
//!   re-invokes with `overwrite=true` on the user's choice. This
//!   guards against silently clobbering a manually-edited SOP.
//! - The function does not create `memory/` itself. If `{ga_path}/memory`
//!   doesn't exist, the user's GA install is misconfigured (a fresh
//!   GA always ships with `memory/`) — returning `GaPathInvalid` lets
//!   the GUI explain the failure rather than papering over it.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// SOP body bundled into the Galley binary at build time. The source
/// file is the same one a developer reads in the repo, so there's no
/// drift risk: changing the SOP requires editing the file at this
/// path, which automatically updates the embedded body on the next
/// `cargo build`.
const SOP_BODY: &str = include_str!("../../docs/integrations/galley-supervisor-sop.md");

/// Fixed filename inside the target `memory/` directory. Stable across
/// Galley versions so users can re-install / update without leaving
/// orphaned files.
const SOP_FILENAME: &str = "galley-supervisor-sop.md";

#[derive(Debug, Serialize)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum InstallSopOutcome {
    /// Wrote the file successfully. `path` is the absolute destination
    /// the GUI can show in the success toast.
    Installed { path: String },
    /// File already exists at the target and `overwrite` was `false`.
    /// The GUI prompts the user; a follow-up call with `overwrite=true`
    /// proceeds with the write.
    AlreadyExists { path: String },
    /// `ga_path` doesn't exist, isn't a directory, or lacks a
    /// `memory/` subdir. `reason` is a human-readable string the GUI
    /// surfaces in an error toast.
    GaPathInvalid { reason: String },
    /// Filesystem write failed (permission, disk full). Distinct from
    /// `GaPathInvalid` so the GUI can choose to retry vs ask the user
    /// to inspect their GA install.
    WriteFailed { path: String, reason: String },
}

/// Install the embedded SOP into `<ga_path>/memory/galley-supervisor-sop.md`.
///
/// See module docs for the caller contract. The four returnable
/// outcomes cover every branch — the function never panics.
pub fn install_to_ga_memory(ga_path: &str, overwrite: bool) -> InstallSopOutcome {
    let ga_dir = PathBuf::from(ga_path);
    if !ga_dir.is_dir() {
        return InstallSopOutcome::GaPathInvalid {
            reason: format!("ga_path `{ga_path}` is not a directory"),
        };
    }
    let memory_dir = ga_dir.join("memory");
    if !memory_dir.is_dir() {
        return InstallSopOutcome::GaPathInvalid {
            reason: format!(
                "{} has no `memory/` subdirectory — open your GenericAgent at least once so it creates the standard layout",
                ga_dir.display()
            ),
        };
    }

    let target = memory_dir.join(SOP_FILENAME);
    if target.exists() && !overwrite {
        return InstallSopOutcome::AlreadyExists {
            path: target.display().to_string(),
        };
    }

    match std::fs::write(&target, SOP_BODY) {
        Ok(()) => InstallSopOutcome::Installed {
            path: target.display().to_string(),
        },
        Err(e) => InstallSopOutcome::WriteFailed {
            path: target.display().to_string(),
            reason: e.to_string(),
        },
    }
}

/// For tests: expose the embedded body length so the test suite can
/// guard against accidentally-empty installs after a file-relocation
/// refactor.
#[cfg(test)]
fn sop_body_len() -> usize {
    SOP_BODY.len()
}

/// Read the embedded SOP body. Used by the Tauri command when callers
/// want to preview the SOP content before installing (future surface;
/// no current GUI consumer). Public so it lives alongside the install
/// path.
pub fn sop_body() -> &'static str {
    SOP_BODY
}

/// Reserved access to the canonical filename. Helpers / tests use
/// this to construct expected paths without re-encoding the string.
pub fn sop_filename() -> &'static Path {
    Path::new(SOP_FILENAME)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn fake_ga_root_with_memory() -> TempDir {
        let td = TempDir::new().expect("tempdir");
        std::fs::create_dir_all(td.path().join("memory")).expect("mkdir memory");
        td
    }

    #[test]
    fn embedded_body_is_non_empty() {
        // The SOP we embed must not have been accidentally emptied by
        // a path / build-script refactor. A trivial sanity check —
        // anything sub-1KB means something is wrong.
        assert!(
            sop_body_len() > 1024,
            "SOP body looks suspiciously short: {} bytes",
            sop_body_len()
        );
    }

    #[test]
    fn fresh_install_writes_file() {
        let td = fake_ga_root_with_memory();
        let ga_path = td.path().to_str().unwrap();
        let outcome = install_to_ga_memory(ga_path, false);
        match &outcome {
            InstallSopOutcome::Installed { path } => {
                let written = std::fs::read_to_string(path).unwrap();
                assert_eq!(written.len(), sop_body_len());
            }
            other => panic!("expected Installed, got {other:?}"),
        }
    }

    #[test]
    fn existing_file_without_overwrite_returns_already_exists() {
        let td = fake_ga_root_with_memory();
        let target = td.path().join("memory").join(SOP_FILENAME);
        std::fs::write(&target, "stale content").unwrap();

        let outcome = install_to_ga_memory(td.path().to_str().unwrap(), false);
        assert!(
            matches!(outcome, InstallSopOutcome::AlreadyExists { .. }),
            "expected AlreadyExists, got {outcome:?}"
        );

        // File untouched
        let kept = std::fs::read_to_string(&target).unwrap();
        assert_eq!(kept, "stale content");
    }

    #[test]
    fn overwrite_replaces_existing() {
        let td = fake_ga_root_with_memory();
        let target = td.path().join("memory").join(SOP_FILENAME);
        std::fs::write(&target, "stale content").unwrap();

        let outcome = install_to_ga_memory(td.path().to_str().unwrap(), true);
        assert!(
            matches!(outcome, InstallSopOutcome::Installed { .. }),
            "expected Installed, got {outcome:?}"
        );
        let after = std::fs::read_to_string(&target).unwrap();
        assert_eq!(after.len(), sop_body_len());
    }

    #[test]
    fn missing_ga_path_returns_invalid() {
        let outcome = install_to_ga_memory("/nonexistent/path/galley-test", false);
        match outcome {
            InstallSopOutcome::GaPathInvalid { reason } => {
                assert!(reason.contains("not a directory"));
            }
            other => panic!("expected GaPathInvalid, got {other:?}"),
        }
    }

    #[test]
    fn ga_path_without_memory_dir_returns_invalid() {
        let td = TempDir::new().expect("tempdir");
        // Intentionally don't create memory/.
        let outcome = install_to_ga_memory(td.path().to_str().unwrap(), false);
        match outcome {
            InstallSopOutcome::GaPathInvalid { reason } => {
                assert!(
                    reason.contains("memory"),
                    "reason should mention memory dir, got: {reason}"
                );
            }
            other => panic!("expected GaPathInvalid, got {other:?}"),
        }
    }
}

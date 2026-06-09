# Yole Demand Pool

This file is the lightweight backlog for ideas that should be collected first,
then implemented and released together when the package is ready.

## Intake Rules

- Add the date, requirement, value, and current status.
- Keep product decisions here short; move larger design notes into a focused
  doc when implementation begins.
- Before a release, review this pool and mark each included requirement with
  the target version.

## Requirements

| ID | Date | Requirement | Value | Status | Target |
|---|---|---|---|---|---|
| R-001 | 2026-06-08 | Add a manual refresh button to the balance dropdown. | After an admin updates a user's balance, the user can refresh immediately without starting another action. | Implemented | 0.0.1 |
| R-002 | 2026-06-08 | Support a VPS-hosted app update channel without publishing artifacts to GitHub first. | Early releases can be tested and distributed from the VPS while keeping the existing Tauri updater flow. | Implemented | 0.0.1 |

## Notes

### R-002 VPS-Hosted Updates

This is feasible with the current updater architecture because the client reads
an HTTPS manifest endpoint and verifies signed update artifacts. GitHub is only
the current hosting path, not a hard requirement.

Minimum design:

- Generate and protect a Tauri updater private signing key.
- Embed the matching public key and a VPS HTTPS manifest URL at build time.
- Upload the Windows updater package, installer, signature, and `latest.json`
  to the VPS.
- Serve `latest.json` and package files over HTTPS.
- Keep the manifest format compatible with Tauri updater so the client can
  check, download, verify, and install directly.

Current decision:

- The updater private key is stored on the VPS under the release secret path
  documented in [repository and release topology](./repository-and-release-topology.md).
- The Windows `0.0.1` manual-test channel is hosted at the VPS stable endpoint.
- GitHub Releases remain a public backup/archive surface; the live installed
  app channel reads the VPS manifest unless a future release plan changes that.

# Repository And Release Topology

This document prevents Yole's private source repository, public distribution
repository, and VPS release paths from being mixed up.

## Core Rule

Yole uses separate channels for separate jobs:

- Private source repository: full code backup and development history.
- Public repository: product-facing docs, screenshots, releases, and feedback.
- VPS: primary domestic download, updater, and provisioner hosting.

Do not push full source history to a public repository unless the owner
explicitly decides to open source Yole.

## Repository Roles

| Channel | Visibility | Contents | Purpose |
|---|---|---|---|
| `D:\yole` working tree | Local | Full source, docs, build scripts, release artifacts | Active development |
| `xiaoguangpan/yole-private` | Private | Full source history, excluding secrets | Disaster recovery and private collaboration |
| `xiaoguangpan/yole` | Public | README, screenshots, changelog, roadmap, FAQ, installer releases, license notices | Trust, user feedback, and optional backup download |
| VPS | Private server, public HTTPS assets | Provisioner service, update manifests, installers, QR/static support assets | Main user-facing distribution and account provisioning |

## Git Remote Policy

It is technically possible for one working tree to push to multiple Git remotes:

```bash
git remote add private git@github.com:<owner>/<private-repo>.git
git push private main
```

Use this only for full-source private remotes.

Do not add the public repository as a remote of `D:\yole`. A public repo remote
attached to the full source tree creates a permanent risk of pushing the whole
history by mistake.

Recommended structure:

```text
D:\yole\                 Full private source working tree
D:\yole-public\          Separate public-only repository
```

The public repository should be updated by copying an allowlisted set of files
from `D:\yole` into `D:\yole-public`, then committing from `D:\yole-public`.

## Public Repository Allowlist

Allowed public files:

- `README.md`
- `README_en.md`
- `CHANGELOG.md` or release notes
- `docs` pages written for users
- screenshots and marketing images
- installer files attached to GitHub Releases
- `LICENSE` and third-party license notices
- issue templates and discussion templates

Do not publish:

- `core/`, `gui/`, `cli/`, `runner/`, `managed-ga/`, `provisioner/`
- private release scripts
- NewAPI admin credentials
- updater private signing keys
- VPS SSH keys or deployment credentials
- real `.env` files
- account stores, database files, logs, or user data

## Current Local Release Package Path

Manual Windows test packages are copied to:

```text
D:\yole\release-package\<version>\
```

Current package:

```text
D:\yole\release-package\0.0.1\Yole_0.0.1_x64-setup.exe
D:\yole\release-package\0.0.1\SHA256SUMS.txt
```

This folder is convenient for local handoff. It is not the canonical updater
channel.

## VPS Paths

Current provisioner paths:

```text
/opt/yole-provisioner/yole-provisioner
/opt/yole-provisioner/yole-provisioner.env
/opt/yole-provisioner/accounts.json
/opt/yole-provisioner/wechat-qr.jpg
```

Current public provisioner URL:

```text
https://na.itxgp.com/yole-provisioner
```

Current updater paths:

```text
/opt/static-sites/prototypes/yole-updates/stable/latest.json
/opt/static-sites/prototypes/yole-updates/stable/Yole_<version>_x64-setup.exe
/opt/static-sites/prototypes/yole-updates/stable/Yole_<version>_x64-setup.exe.sig
```

Current public updater URL:

```text
https://na.itxgp.com/yole-updates/stable/latest.json
```

Current public download path:

```text
/opt/static-sites/prototypes/yole-downloads/windows/Yole_<version>_x64-setup.exe
https://na.itxgp.com/yole-downloads/windows/Yole_<version>_x64-setup.exe
```

Updater signing key paths on the VPS:

```text
/opt/yole-updater/secrets/yole-updater.key
/opt/yole-updater/secrets/yole-updater.key.pub
```

The private key stays on the VPS and must not be copied into the repository or
chat. The public key may be copied into a local ignored file for release builds.

## Updater Signing

Tauri updater signing is required for automatic in-app updates. The private key
must never be committed to any repository. Store it only in a private release
secret store, such as the VPS with strict filesystem permissions or a GitHub
Secret if GitHub Actions is used for release builds.

The public key may be embedded in release builds and stored in private build
configuration. The public key is not sufficient to sign malicious updates.

## Release Flow

For a manual local test release:

1. Update version metadata in the private source tree.
2. Run the required checks.
3. Build the Windows installer.
4. Copy installer and hash to `D:\yole\release-package\<version>\`.
5. Optionally upload the installer to the VPS download path.
6. Optionally attach the installer to the public GitHub Release.

For a future automatic-update release:

1. Build with `YOLE_UPDATER_PUBKEY` and `YOLE_UPDATER_ENDPOINT`.
2. Sign updater artifacts with the private updater key.
3. Generate `latest.json` with inline signatures.
4. Upload updater artifacts and `latest.json` to the VPS update path.
5. Verify the public HTTPS manifest and package URLs.

## Agent Safety Checklist

Before any push or upload, check:

- Am I in `D:\yole` or `D:\yole-public`?
- Is the target private source backup, public docs, VPS download, or VPS updater?
- Does the target allow full source code?
- Does the change contain secrets, private keys, `.env`, databases, or logs?
- Does a public update include only allowlisted public files?

If any answer is unclear, stop and ask the owner before pushing.

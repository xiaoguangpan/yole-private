# Release workflow

Galley 发版 SOP。本文档定义 v0.2 起的正式发版流程，配合 `.github/workflows/release.yml` 工作。

> **相关文档**
> - 工作流文件: [`.github/workflows/release.yml`](../.github/workflows/release.yml) (tag 触发发版) / [`.github/workflows/check.yml`](../.github/workflows/check.yml) (PR 时三平台 build 验证)
> - Win 手动 build 指南: [`docs/windows-build-checklist.md`](./windows-build-checklist.md) — 当 CI 不可用、需要本地出一份 .exe 时参考

## 总览

```
开发：本地 pnpm tauri dev (dogfood)
       ↓
版本号 bump (tauri.conf.json + package.json)
       ↓
git commit + git tag v0.2.0 + git push origin main v0.2.0
       ↓
GitHub Actions release.yml 自动触发
       │
       ├─ macos-14 (Apple Silicon) → Galley_0.2.0_aarch64.dmg
       ├─ macos-13 (Intel)         → Galley_0.2.0_x64.dmg
       └─ windows-latest           → Galley_0.2.0_x64-setup.exe
       ↓
ubuntu-latest 收集三份产物 + gh release create --draft
       ↓
手动 review: GitHub Release 页面看 draft、edit 加亮 notes、本地下载三份 smoke test
       ↓
点 publish → 用户可见 + 可下载
```

构建时间预估：每个 platform job 8-15 min（缓存命中后），三个并行。全流程 push tag 到 draft release ready 大约 **15-20 min**。

## 版本号策略

Semver 0.x.y，pre-1.0 阶段：

| 例子 | 含义 | 触发场景 |
|---|---|---|
| `v0.2.0` | 增功能 release | 新 feature ship (e.g. Win 支持上线) |
| `v0.2.1` | 补丁 release | 单点 bug fix (e.g. Win toggleMaximize 不灵) |
| `v0.2.0-rc.1` | 预发版 candidate | Win 机 smoke test 前的内部验证版 |
| `v1.0.0` | 第一个稳定版 | 用户量起来 + 自动更新就绪 + 关键功能稳定 |

预发版 tag 包含 `-`，CI 自动 mark prerelease，GitHub Release 列表不会把它推作「latest」给普通用户。

## 发版前 Pre-flight 清单

每次正式 release 前过一遍：

### 1. 代码完备

- [ ] `main` 分支 CI 全绿（`check.yml` 三平台通过）
- [ ] 本地 `pnpm typecheck` / `pnpm lint` / `cargo check` 干净
- [ ] 本地 `pnpm tauri dev` smoke 跑通核心流程（新对话 / multi-step / 审批 / 切 LLM）
- [ ] 如果包含 GA baseline 升级：[baseline upgrade workflow](../CLAUDE.md#baseline-upgrade-workflow) 走完、devlog 写好

### 2. 文档完备

- [ ] 本次 release 有对应 devlog（`docs/devlog/YYYY-MM-DD-*.md`），叙事完整 + 6 段
- [ ] CLAUDE.md 阶段表更新到当前
- [ ] PRD / DESIGN.md 如有变化已同步
- [ ] 上一次 release 以来的 commits 简要回顾一遍，对应到 release notes 草稿

### 3. 版本号 bump

把版本号同步改两处：

```bash
# desktop/package.json
"version": "0.2.0"

# desktop/src-tauri/tauri.conf.json
"version": "0.2.0"

# desktop/src-tauri/Cargo.toml (如果显式声明了 version，目前 = 0.1.0 跟其它解耦)
# v0.2 是否同步 Cargo.toml 看具体情况：Cargo.toml 的 version 是 lib name，
# 不直接影响 bundle 文件名（那个由 tauri.conf.json + package.json 决定）。
# 建议同步以免日后查问题困惑。
```

提交一个独立 commit：`Bump version v0.2.0`。**不要**跟功能 commit 混在一起——回滚版本号方便。

### 4. 跑预发版

正式 tag 之前先打一个 RC：

```bash
git tag v0.2.0-rc.1
git push origin v0.2.0-rc.1
```

CI 跑完产生 3 份预发版产物（GitHub Release 上标 Prerelease）。下载 + 装 + 跑核心流程。RC 没问题再打正式 tag。

> 如果是纯 bugfix（`v0.2.1`）改动很小且回归测试过了，可以跳 RC 直接打正式 tag。

## 正式发版步骤

### Step 1. 打 tag 并推

```bash
git tag v0.2.0
git push origin main v0.2.0
```

> 推 main + tag 一起，避免 tag 引用了未推送的 commit 导致 CI fetch 失败。

### Step 2. 等 CI（~15-20 min）

打开 https://github.com/wangjc683/galley/actions 看进度。三个 build job 并行。`release` job 等三个全过才跑。

CI 完成时：GitHub 顶部红圈通知 + 邮件提醒（默认订阅）。

### Step 3. Review draft release

进 https://github.com/wangjc683/galley/releases 看到一个 draft `Galley v0.2.0`：

- **产物列表**：确认有 3 个文件
  - `Galley_0.2.0_aarch64.dmg`
  - `Galley_0.2.0_x64.dmg`
  - `Galley_0.2.0_x64-setup.exe`
- **Auto-generated notes**：GitHub 根据 tag 间的 commit 自动列出来。点 **Edit** 按下面模板加工：

```markdown
## What's new
- 高亮 1-3 件用户视角能感知的核心变化（不是 commit 列表）
- 用 user-facing 语言：「Windows 版本上线」而不是「Y plan custom chrome implemented」

## Improvements
- 列出小改进（UX 打磨、性能、bug fix）

## Known issues
- 已知未修的问题 + workaround
- 比如：「Win 11 用户：Snap Layouts hover 选择器暂未支持，请用 Win+Arrow 替代」

## Installation
- **macOS Apple Silicon (M1+)**: 下 `aarch64.dmg`
- **macOS Intel**: 下 `x64.dmg`
- **Windows 10/11**: 下 `x64-setup.exe`，运行安装

首次启动 macOS 会因为没签名提示风险 → 右键 → 打开。Win 类似 → SmartScreen 警告 → 更多信息 → 仍要运行。

## Upstream
GA baseline: `<commit-hash>` (e.g. 6bb3104)

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

底部 GitHub 自动加的 commit list 保留作为详细变更记录。

### Step 4. Smoke test 三份产物

把 3 个文件下载到本地，按下表跑核心流程：

| 平台 | 装法 | smoke 路径 |
|---|---|---|
| Mac arm64 | 右键 → 打开 `.dmg` → 拖进 Applications | 跑新对话 / 切 LLM / 触发一次审批 |
| Mac x64 (Intel) | 同上，在 Intel Mac 上装 | 同上 |
| Win x64 | 双击 `-setup.exe` 装 | 按 [windows-build-checklist.md §4](./windows-build-checklist.md#4--smoke-test-checklist) 25 项 |

任何 smoke 项失败：**不要 publish**，先 `git tag -d v0.2.0 && git push origin :v0.2.0` 删 tag、修 bug、bump 到 `v0.2.1`（或推 `v0.2.0-rc.2` 重新预发）。

### Step 5. Publish

Release 页面右上角 → **Publish release**。一秒钟从 draft 变公开。

GitHub 自动：
- 发邮件给 watchers
- 在 repo 顶部 banner 显示「New release」
- Release atom feed 更新

### Step 6. 后续

- [ ] 用户群 / Twitter / 朋友圈 / 微博发版通告（人工）
- [ ] 监控 [GitHub Issues](https://github.com/wangjc683/galley/issues) 头 24h，回 bug report
- [ ] 如果 24h 内发现 critical bug：走 hotfix 流程（下方）

## Hotfix 流程

发版后头 48h 内发现严重 bug：

1. `git checkout -b hotfix/v0.2.1` 从 `v0.2.0` tag 开（不要从 main，main 可能已有未发版的 commit）
2. 修 bug、加测试
3. bump 到 `v0.2.1`
4. Merge back to main + tag + push
5. 走正常发版流程，但 RC 可跳过（影响小、改动小）

## 预发版（RC）流程

跟正式发版几乎一样，区别：

- tag 包含 `-`（如 `v0.2.0-rc.1`、`v0.2.0-rc.2`）
- CI 自动 mark prerelease，GitHub Release 不推作 latest
- Release notes 标 **RC** 字样
- 不发用户群通告，只内部 dogfood

## CI 故障排查

### Symptom: macos-13 runner 排不到

GitHub Actions 偶发某些 runner 排队。等 5-10 min 通常自然解决。持续超过 30 min：去 https://www.githubstatus.com 看 Actions 状态。

### Symptom: cargo check 在 Win 上挂 linker error

通常是 Rust + MSVC 版本组合问题。check `dtolnay/rust-toolchain@stable` 是不是用了不兼容版本。临时 workaround：pin Rust 版本（如 `dtolnay/rust-toolchain@1.78`）。

### Symptom: pnpm 报 lockfile mismatch

`pnpm install --frozen-lockfile` 严格 lockfile 模式。如果近期改了 dependencies 但忘提交 `pnpm-lock.yaml`，CI 就挂。本地跑一次 `pnpm install` 再提交锁文件。

### Symptom: tauri build 在 Win 报 NSIS 缺资源

`bundle.windows.nsis.installerIcon` 路径错。检查 `desktop/src-tauri/tauri.conf.json` 的 icon 配置。

### Symptom: 产物 artifact 上传后 `release` job 找不到

`actions/download-artifact@v4` 的 `merge-multiple: true` 把所有 artifact 平铺到 `artifacts/` 下。如果 `softprops/action-gh-release@v2` 的 `files: artifacts/**/*` 没匹配到任何文件，说明 build job 的 `path` glob 不对。看 release job 的 `List artifacts` 步输出。

## Intel runner deprecation 应对

`macos-13` runner GitHub 已经标 deprecated（具体下线日期 GitHub 没公告，估计 2026 年底-2027 年）。下线那天到来之前的应对路径：

**方案 A**: drop Intel Mac 支持
- `release.yml` 删 macos-13 matrix 行
- Release notes 加 Intel Mac 用户说明：从 v0.x.0 起不再发 Intel `.dmg`
- 影响：Intel Mac 用户失去新版本，留在最后一个 x64 dmg

**方案 B**: 本地建 Intel Mac dmg
- JC 在自己的 Intel Mac 上手动跑 `pnpm tauri build --target x86_64-apple-darwin`
- 把产物 manual upload 到 Release
- 影响：发版多一步本地 build；可作为过渡方案

**方案 C**: 用 Apple Silicon 跨编译 x86_64
- macos-14 runner 上 `rustup target add x86_64-apple-darwin` + `tauri build --target x86_64-apple-darwin`
- Tauri 2 支持 Mac → Mac 跨架构（同一个 OS，不同 CPU 架构）
- 影响：build 时间加倍（一台机出两份），但 release.yml matrix 简化为单 platform 双 target

JC 的偏好（2026-05-15）：先用 macos-13 直到下线，下线后走方案 B（自有 Intel Mac 兜底）。方案 C 作为长期备选。

## 未来工作 (v0.3+)

### 代码签名

为了消除用户首次启动的「未签名警告」：

**Mac (Apple Developer Program $99/年)**:
- 申请 Developer ID Application certificate
- CI 加 secret: `APPLE_CERTIFICATE` (.p12 base64) + `APPLE_CERTIFICATE_PASSWORD` + `APPLE_ID` + `APPLE_PASSWORD` + `APPLE_TEAM_ID`
- 在 `release.yml` 加 codesign + notarize 步
- 工时 ~2-3 h 一次性 + $99/年

**Windows (代码签名证书 $200-400/年)**:
- 从 SSL.com / Sectigo 买证书
- CI 加 secret: signing cert + password
- 在 `release.yml` 加 signtool 步
- 工时 ~1-2 h 一次性 + 年费

**判断节点**：dogfood 群体之外有真用户量时才投入。

### 自动更新 (`tauri-plugin-updater`)

签名搞定后启用：用户开 app 时自动检查新版本，提示一键升级。需要：

- Tauri signing key pair (`TAURI_SIGNING_PRIVATE_KEY` + 公钥嵌 app)
- `latest.json` 文件托管在 GitHub Pages / S3
- CI 加生成 + 上传 `latest.json` 步

工时 ~4-6 h 一次性。属 v0.3 scope。

### Linux 构建

`ubuntu-latest` runner + AppImage / deb 打包。低优先级，等真有 Linux 用户问。

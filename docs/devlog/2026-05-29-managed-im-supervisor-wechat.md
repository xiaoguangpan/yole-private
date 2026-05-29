# Managed IM Supervisor · WeChat alpha.2 prep

**Date**: 2026-05-29
**Status**: Implemented; pending `v0.2.0-alpha.2` tag / release
**Related**: [managed GA runtime](../managed-ga-runtime.md), [release / update SOP](../release-update-sop.md), [release workflow](../release-workflow.md)

## Context

`v0.2.0-alpha.2` 的核心新增面向内置 GA 用户：把 IM 接入做成 Galley 托管的 Managed IM Supervisor。第一阶段只开放微信，目标是让普通用户在 Settings 里点接入、扫码，然后只要 Galley 运行，就能从微信里给 Galley 发消息。

这次讨论里同时对齐了一个边界：外部 GA 用户不应该被 Galley 的托管 IM / 模型配置打扰。外部 GA 本来就由高级用户自己管理环境，所以 Settings -> IM 在 external runtime 下隐藏；已经接入的托管微信进程不因短暂切换 external 而自动停止。

## Decisions

- 新增 `Settings -> IM`，不放进 Onboarding。首次体验仍聚焦开箱即用的模型配置，IM 属于配置完成后的扩展入口。
- IM 架构命名为 Managed IM Supervisor，为以后 Feishu / Telegram / DingTalk / WeCom 等平台预留；第一阶段只实现 WeChat。
- 微信接入复用 GA 官方 iLink 扫码流程，不加绑定码、allowlist 或 Galley 自定义授权层。
- Galley Core 启动 `runner.managed_im_supervisor`，注入 managed model loader、managed state root、runtime prompt、persona prompt 和紧凑 IM Supervisor prompt。
- 不把完整 Supervisor SOP 常驻进 system prompt。Galley materialize 一份自己管理的 SOP reference 文件，IM Agent 在复杂调度或规则不确定时自行读取。
- 微信 token、二维码和日志放在 Galley managed state 下的 `im/wechat/*`，不污染官方默认 `~/.wxbot/token.json`。
- Settings -> IM 卡片采用和 Settings -> Models provider row 接近的折叠 / 展开形态；中文显示“微信”，英文显示“WeChat”，图标使用低视觉权重的单色微信 glyph。
- normal UI 不显示 pid / bot id / updatedAt。用户只需要知道是否已接入、是否等待扫码、是否正在接收消息，以及下一步该做什么。
- `activeRuntimeKind === "managed"` 时显示 Settings -> IM；切到 external 时隐藏，并在用户正停留在 IM tab 时自动回到 Runtime tab。
- 重新生成二维码会先停止旧 supervisor 子进程，再启动新进程；二维码文件名使用每次启动唯一路径，降低 Windows WebView 文件锁导致二维码不刷新或过期的风险。

## Rejected Alternatives

- **绑定码 / allowlist**：安全感来自 Galley 自己的流程，但会偏离 GA 官方微信接入方式，并增加普通用户理解成本。
- **把完整 SOP 注入 IM system prompt**：token 成本高，也会把长期规则固化在 prompt 里；reference file 更适合本地托管产品。
- **把 IM 接入放进 Onboarding**：会让普通用户在还没完成模型配置前理解“外部聊天入口”，不是首轮必须任务。
- **外部 GA 模式仍显示 Settings -> IM**：容易让用户误以为 Galley 会管理外部 GA 的 IM 接入，违背 external runtime 边界。
- **切到 external 时自动停掉微信 supervisor**：短暂切换 runtime 的用户会突然失去微信入口，产品认知更差；隐藏 UI 已足够避免混淆。
- **固定 `wx_qr.png` 文件名**：macOS dogfood 可以工作，但 Windows 更容易遇到图片文件被 WebView 锁住后覆盖失败的问题。

## Open Questions

- 需要在 Windows 上真机 smoke 一次 Settings -> IM 的二维码生成、扫码、重新生成和退出接入。
- `v0.2.0-alpha.2` 发布后，是否把 beta update channel promote 到这个 alpha tag，让 `v0.2.0-alpha.1` 内测用户测试检查更新 / 更新安装。
- 后续 IM 平台是否继续共用同一个 Settings -> IM 卡片模式，还是不同平台需要更明确的接入状态差异。

## Next

- 先提交 Managed IM Supervisor / Settings IM / managed runtime patch 这批功能改动。
- 单独 bump 四处 package metadata 到 `0.2.0-alpha.2`，让 tag 指向版本号 commit。
- tag `v0.2.0-alpha.2` 后推 main + tag，等待 draft release 产物。
- smoke draft artifacts，通过后 publish GitHub Pre-release。
- 如果决定让 `v0.2.0-alpha.1` 用户测试更新功能，再手动 promote beta update channel 到 `v0.2.0-alpha.2`，然后用已安装的 alpha.1 测 Settings -> About 检查更新。

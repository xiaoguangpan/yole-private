# v0.0.8 Unified Model Selection Release

**Date:** 2026-06-15  
**Status:** Implemented and released to the VPS Windows stable channel  
**Related:** `docs/project-status.md`, `docs/yole-newapi-setup.md`, `managed-ga/patches/0008-yole-multimodal-routing-and-image-tools.patch`

## Context

The 0.0.7 model chain used hidden account-tier routing across the desktop
client, the managed GA runtime, the provisioner, and NewAPI token/group state.
It let Yole switch ordinary and VIP users server-side and retry across fallback
models, but dogfood exposed brittle behavior: stale token limits, account-tier
cache lag, first-token latency, incorrect fallback choices, and confusing
answers when the assistant was asked which model was in use.

## Decisions

- Replace hidden VIP/non-VIP routing with explicit text-model selection in the
  Yole UI.
- Keep `deepseek-v4-pro` as the default text model.
- Expose `gpt-5.5` as a selectable text model instead of silently assigning it
  by user tier.
- Let NewAPI enforce access and pricing. Yole no longer tries to mirror
  account-tier state into managed GA before every user request.
- Keep image generation fixed at `gpt-image-2`.
- Keep vision assist fixed at `qwen3.7-plus`, and call it only when the active
  text model does not accept image input.
- Preserve the legacy `/api/runtime/route` provisioner endpoint as a
  compatibility response for older clients, but stop using it in the 0.0.8
  desktop client.

## Rejected Alternatives

- Keep the hidden VIP route and patch more cache refresh points. This would add
  more moving parts to a chain whose failure mode is already user-visible.
- Keep client-side cross-model fallback. This hides upstream failures but can
  make cost, permission, and model identity unpredictable.
- Make every user silently use GPT-5.5. This is simpler technically but makes
  trial balances disappear too quickly and weakens the default product cost
  profile.
- Default to DeepSeek only with no visible GPT option. This is the simplest
  stable mode, but it removes a useful premium path that NewAPI can already
  price and restrict cleanly.

## Open Questions

- Whether GPT-5.5 should remain visible to all users with NewAPI pricing only,
  or be hidden in the UI for users whose token cannot access it.
- Whether NewAPI token access errors should offer a one-click "switch back to
  DeepSeek" recovery in the composer.
- Whether the public website/release notes should explain model costs as
  relative point multipliers or avoid model-specific pricing language.

## Next

Monitor 0.0.8 dogfood for first-token latency, NewAPI balance refresh, image
message handling, and update-channel behavior. If the explicit picker proves
stable, remove the remaining legacy route compatibility path in a later major
cleanup after old clients age out.

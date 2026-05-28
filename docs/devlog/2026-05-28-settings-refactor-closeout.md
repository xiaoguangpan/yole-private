# 2026-05-28 — Settings refactor closeout

**Date:** 2026-05-28
**Status:** Implemented, reviewed, and lightly dogfooded
**Related:** `gui/src/components/screens/settings/Settings.tsx`, `gui/src/components/screens/settings/SettingsModels.tsx`, `gui/src/components/screens/settings/SettingsRuntime.tsx`, commits `d3be0f5`, `3c2daa4`, `5abe435`

## Context

Settings had grown into a set of large mixed-responsibility React files. The
visible product problem was not broken UI, but maintenance risk: Settings is
where runtime setup, managed model credentials, provider/model ordering, and
external GA fallback all meet. A casual edit in one area could accidentally
change another configuration path.

The refactor started as an evaluation of whether `SettingsModels.tsx` should be
split and then expanded to the Settings shell and Runtime tab. The stopping
point was chosen deliberately after the high-value, low-risk seams were
separated.

## Decisions

- Settings shell should stay thin. `Settings.tsx` now owns the dialog frame,
  active tab state, and tab mounting; the sidebar and shared Settings types live
  separately.
- Models should be split along user-visible responsibilities first, not by
  arbitrary line count. Provider editor, provider cards, configured model list,
  draft editor, advanced options, primitives, probe helpers, and model utilities
  now have separate files.
- `SettingsModels.tsx` should remain the page controller, but its stateful
  lifecycles should be named. Provider form, provider connection checks,
  provider model/draft state, model ordering, expansion, and saved-config toast
  each have a small controller hook.
- Runtime should only get a Phase 1 split for pure UI leaf components. Managed
  / external runtime cards, Setup Assistant access, Health Check, and GA version
  moved out. `PythonPanel`, `ManagedRuntimeCard`, and `PathField` stayed in the
  main file because they touch store subscriptions or sensitive path-entry
  behavior.
- Refactor stops here for now. The current files are small enough to work in,
  and further splitting would mostly move complexity rather than reduce risk.

## Rejected Alternatives

- **Extract one giant `useSettingsModels` hook** — rejected because it would
  hide the same async state graph in another file. Smaller lifecycle hooks make
  the intent clearer and are easier to review.
- **Split every Settings tab into a deeper hierarchy immediately** — rejected
  because some tabs are already simple enough. The point is reducing change
  risk, not maximizing file count.
- **Move `PathField` during the Runtime UI pass** — rejected because GA path
  typing, debounce validation, blur / Enter commit, and picker blur suppression
  are a single fragile behavior cluster that deserves its own Tauri smoke pass.
- **Create a generic Settings card framework** — rejected because local
  component names communicate the product surface better than a new abstraction
  layer.

## Open Questions

- If Runtime needs more work, `PathField` should be treated as a standalone
  behavior refactor with real Tauri WebView verification.
- `ProviderCard.tsx` is still a candidate for leaf extraction, but only when
  future work touches provider rows again.
- Browser-only smoke remains limited because Settings relies on Tauri APIs; the
  useful product-level verification is still the real desktop app.

## Next

Do not continue splitting Settings just for cleanliness. Reopen the refactor
only when a feature or bugfix needs one of these surfaces, and then choose the
smallest seam around that behavior.

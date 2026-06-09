# Setup Assistant Re-Entry

## Date / Status / Related

2026-05-26. Implemented.

Related: `gui/src/App.tsx`,
`gui/src/components/screens/onboarding/Onboarding.tsx`,
`gui/src/components/screens/onboarding/StepModelConfig.tsx`,
`gui/src/components/screens/settings/SettingsRuntime.tsx`, [DESIGN](../DESIGN.md).

## Context

Onboarding used to be reachable only on first install. That made the setup flow
feel like a one-time trapdoor even though it contains durable operational
checks: Runtime choice, bundled-model setup, external GA folder validation, and
Health Check.

## Decisions

- Add a deep entry in Settings -> Runtime -> More named `Open Setup Assistant`.
- Reuse the same Onboarding / Setup Assistant from the first launch. Do not
  create a separate half-revisit flow.
- Opening the Setup Assistant itself has no side effect. Existing sessions,
  projects, history, and database rows remain untouched.
- Users can continue without changing Runtime or models. In bundled-GA mode,
  a configured model exposes `Continue with current model`; in external-GA
  mode, the saved GA path pre-fills the attach step.
- Bundled model setup keeps connection validation separate from
  `Start using Yole`. The test sends a minimal real model request, shows
  latency, and maps common HTTP / network failures to human-readable guidance.
  Settings -> Models uses the same probe feedback.
- In Onboarding, the model connection test runs automatically after complete
  input settles, because first setup should minimize decision points. Settings
  keeps explicit manual checks for maintenance workflows.
- Settings -> Models keeps probe feedback per provider / model instead of
  treating the last probe as global state. This supports a "check everything"
  pass without earlier results disappearing when the next provider is tested.
  Onboarding uses the same inline-success / nearby-error placement, but keeps a
  single state because it configures only one target at a time.
- Settings -> Models now separates the primary model queue from provider
  maintenance: `Configured models` remains the main view, while connected
  providers default to collapsed maintenance drawers. Provider edit/delete moved
  behind a more menu, and successful probe feedback is low-weight inline text
  instead of persistent green blocks.
- Configured model rows use a quiet hover / focus treatment so the sortable
  primary list feels interactive without turning into floating cards.
- Provider rows were compressed to a single-line summary with truncated long
  names. Protocol type is shown as a low-weight badge after model count so it
  does not read as part of the Provider name. In expanded provider details,
  default models show a lightweight `Default model` status pill; only
  non-default models expose `Set as default`.
- From Settings, the setup flow has a top-level `Back to Settings` escape hatch
  beside the progress indicator. Step footers stay reserved for step-local
  actions.
- Disable the entry while an Agent task is running, because setup can change
  Runtime / model semantics.

## Rejected Alternatives

- Hide Onboarding forever after first launch: rejected because users may need
  to re-check setup after changing machines, models, Python, or GA paths.
- Build a separate Settings-only setup page: rejected because it creates two
  setup mental models and doubles maintenance.
- Call the action `Reset Setup` or `Restart Onboarding`: rejected because it
  sounds destructive even though the flow does not delete user data.

## Open Questions

- Whether future releases should add a dedicated "review current config" panel
  inside the first setup step, instead of only offering a continue button when
  bundled GA is already configured.

## Next

Dogfood both paths: managed configured -> continue with current model, and
external configured -> attach step pre-filled -> Health Check -> Yole.

# 2026-05-31 — Alpha.2 dogfood UX polish

**Date:** 2026-05-31
**Status:** Implemented on `main`; feeding into `v0.2.0` release prep
**Related:** [project status](../project-status.md), [copy language guidelines](../copy-language-guidelines.md), [managed GA runtime](../managed-ga-runtime.md), [Managed IM Supervisor](./2026-05-29-managed-im-supervisor-wechat.md)

## Context

After `v0.2.0-alpha.2` was published, community dogfood quickly surfaced a
pattern: Galley worked on maintainer macOS setups, but rough edges appeared on
Windows, external GA installs, and smaller screens. The fixes in this pass were
less about adding features and more about removing places where users had to
understand Galley's internals to recover.

The product direction stayed the same: Galley should absorb runtime and setup
complexity, while the UI remains quiet once something is configured.

## Decisions

- Small-screen onboarding is a supported path, not an edge case. The desktop
  minimum size is now `960x600`, and the onboarding health step keeps its action
  row sticky so users can finish setup on low-height laptops. Users at `720px`
  height and above should see effectively the same experience as before.
- The repository root has a minimal `package.json` so `pnpm tauri dev` works
  from the project root. The common maintainer command should not fail just
  because the real GUI package lives under `gui/`.
- External GA onboarding now runs a real runtime probe before entering the main
  app. It imports GA, instantiates `GenericAgent`, checks model discovery, and
  can run the same one-output-token model smoke test. This catches failures
  such as missing Python dependencies before the Composer appears broken.
- External GA should be probed with the Python that can actually run that user's
  checkout. Bundled Python remains the managed-runtime default, but external
  users may need their own virtualenv or system Python when their GA checkout
  depends on packages that Galley's bundle does not ship.
- Model tests keep token cost visible but low weight. The test input is `ping`
  and the output cap is one token; onboarding can spend that tiny cost to avoid
  a worse first-run failure, while Settings labels the action more explicitly.
- Settings -> Models now separates two ideas: reading a provider's model list
  and testing a saved model. If a service cannot list models but a configured
  model works, the UI should not frame that as the whole service being unusable.
- Tooltip behavior is centralized. Icon-only controls are acceptable only when
  hover / focus feedback appears quickly enough to explain the control without
  turning the UI into visible instruction text.
- Info toasts are compact system feedback, not mini error dialogs. `Copy
  details` is reserved for warning / error diagnostics with real traceback or
  context, and toast placement is bottom-left so it does not cover Settings'
  required close button or the Composer.
- The former IM surface is user-facing `Channels`. Chinese Settings keeps the
  English tab label and uses the helper `聊天软件`; the page subtitle stays
  outcome-oriented: `在常用聊天软件里和 Galley 对话`.
- Managed mode gets a quiet TopBar Channels entry that jumps to Settings ->
  Channels. It uses `ChatCircleText` without a status dot because a permanent
  dot on a chat icon reads like unread messages. Error attention can still use a
  subtle error tint.
- Channels does not go into onboarding yet, and the TopBar does not show a
  hover list of platforms. The first supported platform is WeChat, but the UI is
  a stable entry point for the category, not a platform inventory.
- While Galley is small, GitHub Issues are primarily the external feedback
  entrance. Maintainer-found problems can be handled directly in code and
  devlog without self-filing every internal task as an issue.

## Rejected Alternatives

- **Keep the old `1120x720` minimum and rely on the OS to stop resizing** —
  this protects the layout but traps low-resolution users before they can finish
  onboarding.
- **Treat onboarding health as filesystem-only** — cheaper, but it lets external
  GA dependency failures leak into the main surface as Composer / Bridge
  crashes.
- **Keep adding packages to bundled Python until external GA works everywhere**
  — wrong ownership boundary. Bundled Python should satisfy managed GA; external
  GA may legitimately require the user's own environment.
- **Make provider list-model failure equal provider failure** — too strict for
  providers that support chat completion but do not expose a compatible model
  listing endpoint.
- **Leave native `title` delays as the tooltip behavior** — technically simple,
  but it makes icon-only controls feel like they have no explanation.
- **Move toast position depending on whether Settings is open** — solves one
  collision but makes system feedback spatially inconsistent.
- **Show a Channels status dot on the chat icon** — the visual language overlaps
  too strongly with unread-message badges.
- **Add a Channels hover list or future platform placeholders** — extra surface
  before users have more than one platform to act on.
- **Self-file issues for every maintainer-discovered bug** — creates process
  overhead before the project needs that internal tracker.

## Open Questions

- Windows smoke needs to cover external GA path normalization, selected Python /
  virtualenv probing, bundled runtime startup, `960x600` onboarding, Browser
  Control, Channels entry, and IM QR refresh.
- When Channels has multiple real platforms, decide whether to rename internal
  `im` routes / components or keep the old identifiers until a larger cleanup.
- Managed bundled Python may need a documented dependency coverage policy:
  enough for bundled GA, not a promise to satisfy arbitrary external GA
  checkouts.
- Provider list-model semantics may need clearer copy later if more services
  support completion but reject model listing.

## Next

Dogfood these post-alpha.2 fixes on macOS and Windows before publishing
`v0.2.0`. Keep the update channel unchanged unless there is an explicit
decision to promote installed users onto the release.

# Bundled Python runtime contract

## Date / Status / Related

- Date: 2026-06-04
- Status: accepted and documented
- Related: [desktop runtime](../desktop-runtime.md), [GA baseline](../ga-baseline.md), [release workflow](../release-workflow.md), [release/update SOP](../release-update-sop.md), `scripts/check-bundled-python-managed-ga.sh`

## Context

Before the next patch release, we reviewed what "bundled GA" should mean from a
user's point of view. The product expectation is stricter than "Galley can start
GenericAgent if the maintainer machine happens to have a good Python venv":
managed GA must open and run from Galley's own packaged interpreter and
dependencies. Attach mode should also get that baseline by default, while still
respecting the boundary that Galley does not modify a user-owned GA checkout.

## Decisions

- Managed / bundled GA release builds must use Galley's packaged Python and
  packaged dependencies. Requiring the user's Python for managed GA is a release
  blocker.
- Attach / external GA release builds also default to Galley's bundled Python.
  This gives a user-owned checkout baseline deps without writing into its venv,
  PATH, source, memory, SOP, or state.
- `gaConfig.useExternalPython = true` remains the explicit escape hatch for
  custom dependencies, unsupported upstream frontends, or deliberate user
  interpreter control.
- Added `scripts/check-bundled-python-managed-ga.sh` as a reusable gate for an
  already-generated bundle. `scripts/bundle-python.sh` invokes it after pip
  installing the audited dependency set.
- The bundled smoke imports a temporary copy of `managed-ga/code`, not the
  working tree path directly. This lets Browser Control generate its ignored
  `tmwd_cdp_bridge/config.js` during import without making release CI depend on
  maintainer-local files or mutating the source payload.
- Release and baseline docs now require the bundled Python smoke when touching
  managed GA, the GA baseline, or bundled runtime deps.

## Rejected alternatives

- Do nothing because release CI already runs `bundle-python.sh`: rejected
  because the product contract was implicit and too easy to miss during local
  baseline work.
- Default attach mode to the user's Python: rejected because it makes fresh
  installs depend on invisible local environment quality. External Python should
  be a conscious escape hatch, not the normal path.
- Try to bundle every possible GenericAgent optional dependency: rejected for
  now. Galley should bundle dependencies for product surfaces it owns; arbitrary
  user extensions belong behind the external-Python escape hatch.

## Open questions

- If upstream GenericAgent adds more optional frontends, decide case by case
  whether Galley owns that surface before adding its dependencies to the
  bundled runtime.
- Future Windows smoke should keep checking that the bundled interpreter can
  import managed GA after installer upgrades, especially around file-lock and
  path conversion issues.

## Next

Run the new bundled Python gate locally, keep it inside release CI through
`bundle-python.sh`, and proceed to the release candidate only after the bundled
runtime smoke passes.

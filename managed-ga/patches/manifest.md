# Managed GA Patch Stack

Patch stack id: `galley-managed-ga-patches-v1`

Current state: no managed-runtime patches are applied yet.

Rules:

- Keep each patch small and product-scoped.
- Record the upstream files touched, reason, rebase risk, and removal condition.
- Remove a Galley patch when upstream GenericAgent provides the same capability.
- Never apply these patches to a user-owned external GenericAgent checkout.

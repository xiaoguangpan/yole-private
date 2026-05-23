# Managed GA Code

This directory is the source-tree build output for Galley's managed
GenericAgent runtime.

It is intentionally separate from managed user state. Release packaging may
replace this directory with a newer upstream GenericAgent baseline plus the
Galley managed patch stack; user memory, SOP, skills, temp files, model
responses, and model config live under Galley Application Support instead.

Do not put API keys or user-owned state in this directory.

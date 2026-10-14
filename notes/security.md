# Security: decisions to look at

Describe decisions here that, in your judgement, could merit closer security review, or could
interact with later decisions to create a security issue. Do not justify why they are, or are not,
concerning; do not predict what might heighten concerns. Instead, in a sentence or so, brief a
security expert who knows what questions to ask.

## Of Interest

* 2026-10-14: the package is published to npm by `.github/workflows/release.yml`, run when a
  GitHub release is published, authenticating by npm's trusted publishing (OIDC, no stored
  token) from the `npm` environment, with provenance. `prepublishOnly` runs lint, typecheck,
  tests and the build in that same job.
* 2026-10-14: `pnpm-workspace.yaml` allows one dependency's install script to run:
  `unrs-resolver` (a native module resolver, pulled in by `eslint-import-resolver-typescript`, a
  development dependency only).

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
* 2026-10-14: every action in `.github/workflows/` is pinned to a full commit SHA, with the
  release it was resolved from in a trailing comment (`@3d3c42e... # v7.0.1`). Dependabot's weekly
  `github-actions` group proposes new SHAs, and rewrites the comment with them.
* 2026-10-14: the package itself (`src/`, exported from `src/index.ts`) is at a stub stage that
  stores whispers and passphrases in plaintext through its storage adapters, for interface
  design; its doc blocks, the README of the demo, and the demo's inspection panels say so. It
  must not be published to npm before the cryptography lands underneath the interface.
* 2026-10-14: the demo app calls Anthropic directly from the browser with the user's own key
  (`dangerouslyAllowBrowser: true` on the SDK client), by design: the key is decrypted on-device
  inside `vault.use(...)` and sent only to `api.anthropic.com`.
* 2026-10-14: `safe-stable-stringify` is a runtime dependency (alongside zod): `stableJsonify`
  (`src/stable-jsonify.ts`) is a thin alias of it, backing snapshot change detection.

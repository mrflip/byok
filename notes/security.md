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
* 2026-10-14: the cryptography landed, replacing the plaintext stub. The stub's stored formats
  (`byok-stub-vault-v0`, `byok-stub-unlock-v0`) are not read by the new code: they existed only
  in the demo and were never published.
* 2026-10-14: Argon2id (the pinned `argon2id_web_v1` spec) runs through `@noble/hashes` -- pure
  JS, audited, no WASM -- at about half a second per derivation in V8. AES-256-GCM encryption,
  key wrapping and randomness come from WebCrypto (`crypto.subtle`, `crypto.getRandomValues`).
* 2026-10-14: the key deriver is a seam (`OpenVaultOpts.keyDeriver`): the pinned Argon2id deriver
  is the default, tests substitute a cheap SHA-256 deriver, and a stored vault records its
  deriver's label and refuses to unlock under any other.
* 2026-10-14: every encryption binds its context as AES-GCM additional data
  (`cipherAdditionalData`): format, applabel, user_id, vaultlabel, vaultId, plus passphraseEpoch
  for key wraps and boxlabel + revisionId for lockboxes, encoded as a JSON array. Ciphertext
  moved between users, vaults, boxes or revisions refuses to open.
* 2026-10-14: a wrong passphrase is learned from the vaultKey envelope's AEAD failure, never a
  comparison; there is no separate passphrase verifier field.
* 2026-10-14: the localUnlockKey is a non-extractable WebCrypto key persisted only by structured
  clone (IndexedDB, `byok/idb`); the vaultKey handle a vault holds between operations is also
  non-extractable. The operations that must wrap the vaultKey (device-remember at unlock, the
  re-wrap in changePassphrase) unwrap a separate extractable transient from the same envelope and
  drop it on return; the remembered-unlock path makes no extractable handle at all.
* 2026-10-14: a stored record that fails validation or AEAD verification is refused with kind
  `corrupt_record` and left in place -- remote data is never auto-deleted. A device-local
  remembered unlock that fails is the one exception: it is dropped, and the user asks again.
* 2026-10-14: the demo app calls Anthropic directly from the browser with the user's own key
  (`dangerouslyAllowBrowser: true` on the SDK client), by design: the key is decrypted on-device
  inside `vault.use(...)` and sent only to `api.anthropic.com`.
* 2026-10-14: `safe-stable-stringify` is a runtime dependency: `stableJsonify`
  (`src/stable-jsonify.ts`) is a thin alias of it, backing snapshot change detection.
* 2026-10-14: `zod` moved from a regular dependency to a peer dependency (`^4.0.0`): the host app
  supplies it, so byok validates with whatever zod instance that app ships.
* 2026-10-14: storage writes are last-writer-wins: a concurrent write to the same lockbox or
  bundle silently buries the earlier one. A `versionedUpdate` (save only if the standing
  `revision_id` / `passphrase_epoch` is the one the writer read) is planned; until the IndexedDB
  adapter performs it inside a single IndexedDB transaction, its check-then-save has a small
  window in which the race survives.
* 2026-10-14: a lockbox's ciphertext length reveals its whisper's length to the backend: there is
  no padding yet (TODO). `store()` refuses a whisper over `maxWhisperBytes` of JSON, an
  `openVault` option defaulting to `MaxWhisperBytes` (40444), checked on write only.

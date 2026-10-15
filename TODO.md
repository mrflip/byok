# TODO

## Soonish

A pad/unpad helper, so a lockbox's ciphertext length stops telling the backend what kind of
whisper it holds (an API key from a PEM). Padding goes inside the encryption, by a published
scheme (PADMÉ, from the PURBs paper, or power-of-two buckets), not one of our own, with a 64-byte
minimum. Above that minimum, check where the lengths of standard payloads land, so that no common
kind sits alone in a size that names it: API keys, OAuth tokens, service-account JSON, RSA keys
(PKCS#8 PEM is 1704, 3272 and 6392 bytes at 2048, 4096 and 8192 bits). The size limits are
bucket watermarks too: `MaxWhisperBytes` (40_444, a vault's `maxWhisperBytes`) and half of each
adapter's `maxRecordBytes`. The top bucket ends at the vault's limit, so padding never pushes a
whisper that passed the cap over it. To decide: does the cap measure the padded size or the
unpadded one? And does padding need a stored-format change, or can it be trailing JSON
whitespace, which every existing reader already ignores?

Two families of VaultError, told apart by kind, so each reaches the right person. **Misuse** is
the developer's to fix and should be loud: `bad_option`, `bad_whisper`, `vault_closed`,
`unknown_key_deriver`, and `bad_label` for the labels the app chooses. safebyok-react rethrows it
during render, so an error boundary and the dev overlay show it (today `VaultProvider` drops an
`openVault` rejection on the floor). **Conditions** are the app's to handle and may reach the user:
`vault_locked`, `wrong_passphrase`, `absent_box`, `stale_write`, storage trouble, and
`whisper_too_large` or `bad_label` when the value came from the user; the provider hands these
over through the context. `errors.ts` exports the split. To decide: kinds that are misuse in one
caller and a condition in another (a boxlabel the user typed).

A pluggable stringifier: how a whisper becomes bytes and back (today `stableJsonify` and
`JSON.parse`), so a host can store values JSON cannot carry.

Tree-shakability: an app that imports one thing from safebyok bundles only what that thing uses.
`sideEffects: false`, no work at module top level, and a check in CI that keeps it so.

Use stable jsonify

Understand npm publishing better, on the first real release: does a staged version keep the `--tag`
it was staged with when you approve it? Is the provenance statement still attached after approval?
The trusted publisher's dist-tag permission is on, but nothing uses it (the release workflow now
installs npm 12.2.0, which can). Does a rejected stage use up its version number? Details in
`human/20261014-staged_publish.md`.

export a treeshakeable safebyok/utils, with a function
`mask(whisper, { head = 2, tail = 4, minStars: 6, maxLen: 15 })`: it replaces all but the first `actualHead` and last `actualTail` characters with '*'; if length is less than minStars + tail + head, remove stars (first from head, then from tail). above maxLen, it will insert `'***...***'` between head and tail. Decide if the interface should be maxLen or maxStars. mask should, first, remove all control characters (including newline, cr or tab)

## NOT YET
Reasonable tasks that we do not plan to do in the near term. Do not anticipate them in your implementation.

* Recovery keys
* A blob helper, for secrets too large to be a whisper: a lockbox holds the key, and safebyok's own
  vetted, context-bound encryption seals the blob into a separate pluggable blob store (its own
  interface beside VaultDB), so no host app hand-rolls encryption with a key taken out of a vault.

## RAGEBAIT

* If the eslint configs cut from the core's (`packages/safebyok/eslint.config.mjs`) drift enough to
  cause an uncaught bug, write a generator script to keep them in sync.

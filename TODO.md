# TODO

## Soonish

### Pluggable treeshaking

we have several pluggable things, and a couple more coming:
- keyDefiner, which is selected by a bag and not an import, offering argon (via a a package) and something else
- database: standalone packages (plus the indexedDB one) (which maybe we publish as a package that just re-exports safebyok/idb ?)
- stringifier (soonish) -- offering JSON.stringify, stable stringify (via a package), and padme-padded versions of each
- label validator: pluggable, so a host can choose its own label grammar. First, investigate whether anything
  depends on the current strictness (storage ckeys, the cipher binding, the react package), and report before loosening.


### Convex skills in the convex sub-package

Add the convex skill to the appropriate place, **scoped** to only that directory
(`packages/safebyok-convex/`), and with only the files likely to be relevant.

### Pad stored values

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

A pluggable stringifier: how a whisper becomes bytes and back (today `stableJsonify` and
`JSON.parse`), so a host can store values JSON cannot carry.
**when this is added we must also store the stringifier label -- it's fine now if it's always JSON decodeable but others could need their own thing**

Tree-shakability: an app that imports one thing from safebyok bundles only what that thing uses.
`sideEffects: false`, no work at module top level, and a check in CI that keeps it so.

Use stable jsonify

### Error families: Incorrect operations (the code is not working as expected) vs Unable to conditions (the code is working and cannot succeed)

Two families of VaultError, told apart by kind, so each reaches the right person. **Misuse** is
the developer's to fix and should be loud: `bad_option`, `bad_whisper`, `vault_closed`,
`unknown_key_deriver`, and `bad_label` for the labels the app chooses. safebyok-react rethrows it
during render, so an error boundary and the dev overlay show it (today `VaultProvider` drops an
`openVault` rejection on the floor). **Conditions** are the app's to handle and may reach the user:
`vault_locked`, `wrong_passphrase`, `absent_box`, `stale_write`, storage trouble, and
`whisper_too_large` or `bad_label` when the value came from the user; the provider hands these
over through the context. `errors.ts` exports the split. To decide: kinds that are misuse in one
caller and a condition in another (a boxlabel the user typed).

### Masking helper

export a treeshakeable safebyok/utils, with a function
`mask(whisper, { head = 2, tail = 4, minStars: 6, maxLen: 15 })`: it replaces all but the first `actualHead` and last `actualTail` characters with '*'; if length is less than minStars + tail + head, remove stars (first from head, then from tail). above maxLen, it will insert `'***...***'` between head and tail. Decide if the interface should be maxLen or maxStars. mask should, first, remove all control characters (including newline, cr or tab)

### NPM Publishing

Understand npm publishing better, on the first real release: does a staged version keep the `--tag`
it was staged with when you approve it? Is the provenance statement still attached after approval?
The trusted publisher's dist-tag permission is on, but nothing uses it (the release workflow now
installs npm 12.2.0, which can). Does a rejected stage use up its version number? Details in
`human/20261014-staged_publish.md`.

## NOT YET
Reasonable tasks that we do not plan to do in the near term. Do not anticipate them in your implementation.

* Recovery keys
* Refactor for React Native compatibility: a WebCrypto shim (react-native-quick-crypto or similar) for
  `crypto.subtle` AES-GCM wrap/unwrap, `getRandomValues` and `randomUUID`; a DeviceDB over the secure
  store or keychain, holding the localUnlockKey as bytes and importing it non-extractable on load (a
  different security posture, for notes/security.md); and a check that no core path needs IndexedDB,
  BroadcastChannel or TextDecoder where Hermes lacks them.
* A blob helper, for secrets too large to be a whisper: a lockbox holds the key, and safebyok's own
  vetted, context-bound encryption seals the blob into a separate pluggable blob store (its own
  interface beside VaultDB), so no host app hand-rolls encryption with a key taken out of a vault.


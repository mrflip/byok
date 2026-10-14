# 2026-10-14: byok-react demo -- interface decisions and open questions

The demo at `demos/byok-react/` exists to settle the package's interface. This note records what
it proposes, where it deliberately departs from the 20261013-relic sketch, and what remains open.

## Vocabulary adopted

* **whisper** -- the secret: any JSON value (string, number, boolean, null, array, plain object).
* **lockbox** -- whisper + `boxlabel` + public metadata (`note`, `created_at`, `updated_at`).
* **vault** -- many lockboxes, scoped by `(applabel, user_id, vaultlabel)`.

`boxlabel`, not the user's example `label`, following STYLE.md's smushed-tag naming; every label
(applabel, vaultlabel, boxlabel, userlabel) shares one `Label` rule: `\w` only, letter first,
2-64 chars. Note that rule refuses hyphens -- `anthropic-prod` from the relic sketch would be
refused. Worth a second look.

## Interface proposed by the stub (`demos/byok-react/src/byok/`)

* `openVault(opts) -> Vault`: settles into `absent | locked | unlocked` without prompting.
  Prompting is the host's job, and only when a whisper is actually wanted.
* React-friendliness per CLAUDE.md: `subscribe(listener) -> unsubscribe`, `getSnapshot()` with
  identity kept until something changes. No React import anywhere in the library layer.
* Whisper ops: `store`, `read`, `use(boxlabel, callback)`, `erase`; all require unlocked and
  throw `VaultError` kind `vault_locked` otherwise. The host wraps them in a `guard()` that
  prompts and retries (see `src/scaffold/vault-context.tsx`).
* First `unlock()` on an absent vault creates it. The UI knows to say "choose a passphrase"
  because the snapshot said `absent`.
* `destroy()` works without unlock: an authenticated owner can always delete their own
  ciphertext server-side; requiring the passphrase would be false comfort.
* Errors: `VaultError` with `kind` from a closed list; messages calm, actionable, and never
  carrying a whisper or passphrase.
* Storage seams: `VaultDB` (remote, host-pluggable; stub: localStorage) and `DeviceDB`
  (device-local remembered unlocks). Rows read back are validated with Zod. Adapter methods are
  async even where nothing awaits, so a storage fault rejects instead of throwing synchronously
  (a real bug the tests caught in the stub).

## Departures from the relic sketch

* Dropped for now (not rejected): epochs/compare-and-swap, recovery kits, passphrase rotation,
  `rotateLockbox`, capability flags, schema registry with typed per-box schemas. The stub stays
  at the surface a first release must get right; these come back with the crypto.
* Flattened `meta: {...}` + `StoreOptions` into a single optional `note` -- enough to demonstrate
  public-while-locked metadata. The real shape (service, hint, last4...) is still to design.
* `status()` became the snapshot itself; `stale`/`corrupted` states deferred with the epoch
  machinery.

## Observations from building the demo

* `guard()` returning `null` for "user dismissed the dialog" is ambiguous with a whisper that is
  legitimately `null`: the demo wraps reads in `{ whisper }` to tell them apart. The library
  should not export a helper with that flaw; `use()`'s callback shape avoids it naturally.
* A `view` facility means the whisper does land in React state in practice. The README's "never
  put secrets in state" guidance needs to say something honest about reveal-to-user features.

## Policy questions for the Coach

1. **Sign-out and the remembered unlock.** The demo keeps a user's 7-day unlock across sign-out
   (scoped per user, so another sign-in can't reach it). The conservative policy -- sign-out ends
   the remembered unlock -- is probably right for the real package. Which default?
2. **Labels**: is refusing `-` in labels (STYLE's `\w`-only rule) acceptable for boxlabels that
   users type? `ANTHROPIC_API_KEY` style works; `anthropic:prod` style does not.
3. **Whisper strictness**: the stub refuses what JSON would mangle (Date, Map, undefined) rather
   than silently flattening. Right call?
4. Commit prefix: these commits use a new `demos:` prefix, absent from PROCESS.md's table.

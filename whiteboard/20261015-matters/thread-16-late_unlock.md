# Thread 16: late_unlock (2026-10-16)

Branch `20261016-late_unlock`, PR [#110](https://github.com/mrflip/safebyok/pull/110), stacked on [#105](https://github.com/mrflip/safebyok/pull/105). Justify: green -- root 123, core 1144, React 95 (was 94), Convex 282, IndexedDB 108, Postgres 162, GraphQL 159, argon2-wasm 44, demo 131.

* **Built**: in `packages/safebyok-react/src/vault-provider.tsx`, an effect subscribes to the
  vault and, when a snapshot change reads `unlocked` while a dialog is asking, ends that dialog
  with `unlocked = true`: it closes and its waiters retry their actions. Doc block, README and a
  patch changeset say so.
* **Tests**: the #98 test that pinned "an unlock finishing after Cancel neither closes nor settles
  a newer dialog" is replaced by its inverse (the newer dialog closes, its read resolves
  `sk-fake`); a second test unlocks the vault directly while a dialog asks. Both fail on the old
  provider.
* **Decisions taken**:
  - The effect hears *changes* only, not the state when a dialog opens. A vault's refusal
    (`ensureUnlocked`) bumps the snapshot to `locked` before it throws, so a stale `unlocked`
    cannot be mistaken for an answer; checking at open would risk close/retry/refuse loops if
    some other `vault_locked` source ever left the snapshot saying `unlocked`.
  - Any unlock closes the dialog, not only a late one: the dialog's own unlock now closes it from
    the subscription a moment before its `onDone(true)`, which then finds it already ended
    (`endAsking` is idempotent for the waiters).
* **Discoveries**: a lock (including thread 10's `whenIdentityRevoked: 'lock'`) leaves the state
  `locked`, so it does not trip the new effect; a sign-out that changes `userId` still ends the
  dialog with false through the existing per-vault cleanup. #98's other minor races (a lock between
  the shared unlock and the retries; `vault_locked` while `vault` is null) are untouched.

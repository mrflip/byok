# safebyok

Bring Your Own Key (BYOK) Browser Vault using E2EE (End-to-end Encryption) and pluggable remote storage

`safebyok` gives users a secure "Bring Your Own Key" vault. Secrets are available on their own device and nowhere else.

* Secrets are always stored in encrypted form, using keys that never leave the end-user's device
* Secrets synchronize across multiple devices using a passphrase the user controls
* The user may change their passphrase without re-entering their information
* Accessing a vault is prohibitively difficult -- even given the application's database, code and environment.

It is react-friendly (`safebyok-react`) and database agnostic: storage adapters implement a small
abstract seam, IndexedDB adapters ship in `safebyok/idb`, and a Convex adapter is planned.
`whiteboard/20261013-relic/proposed-README.md` drafts the full README for when the surface
settles.

## Locking

An unlocked vault stays unlocked until its remembered unlock expires (`rememberForMs`, seven days
by default) or `vault.lock()` is called. `lock()` forgets the unlock in memory and on this device
alike, so the user types their passphrase again afterwards. The core cannot watch for a locked
screen or a hidden tab (it runs where there is no `document`), so locking on those signals is one
line in the host app:

```ts
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { void vault.lock() }
})
```

`visibilitychange` fires when the user switches tabs or the screen locks, which is as close to a
screen-lock signal as every browser offers; Chromium's permission-gated Idle Detection API is the
only true one. The line trades the remembered unlock away: each time the user comes back to the
tab, the vault asks for the passphrase again. When `lockSoon()` lands, it is the gentler callee
for this line (and for sign-out): it lets work already in hand finish before the key dies.

## No recovery

There is no recovery path, on purpose. A forgotten passphrase means an unrecoverable vault: the
user re-enters their API keys, which is annoying, not catastrophic. Say so in your UI; the React
binding's passphrase dialog does.

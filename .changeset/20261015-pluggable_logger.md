---
"safebyok": minor
"safebyok-react": minor
---

**safebyok: `openVault` takes a `logger`.** A `VaultLogger` is an object with `log`, `warn` and `error`, each `(message?, story?, err?) => void`; anything else is refused with kind `bad_option`. The vault tells it what it has nobody to throw to: `lockSoon()` locking at once on a bad clock, a remembered unlock it could not read and so forgot, a background refresh that failed, and a storage adapter's unsubscribe throwing while a failed open closes its watch. With no logger it writes to the console, each message tagged `safebyok:`; pass functions that do nothing for quiet. A logger that throws is ignored. The vault adds no whisper, passphrase, key, ciphertext or option's value to what it hands the logger; a host's own clock or storage error is passed along as the host made it. `safebyok/testing` adds `spyLogger()`, which keeps every call, and `loggedText()`, for sweeping them.

**safebyok-react: `VaultProvider` passes `logger` through**, like every other `openVault` option: define it once, outside the component, since a new one reopens the vault.

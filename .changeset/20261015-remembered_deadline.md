---
"safebyok": patch
---

Lowering `forcePassphraseReentryHours` now reaches devices that already remember an unlock. At each open, a remembered unlock whose deadline lies past now plus the current setting is forgotten and the vault opens locked, so a host that moves from `Infinity` to one hour has every device ask for the passphrase once, at its next open, and every hour from then. Raising the setting lengthens no unlock already remembered. On open, no record is written. The stored shape is unchanged. `LockboxNote`, the rule a lockbox's note follows (text of at most 256 characters), is exported, so a host's form can check a note before calling `store()`.

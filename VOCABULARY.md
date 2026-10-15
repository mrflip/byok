# Vocabulary

safebyok names each thing once, in plain words, and uses that one name in its API, its docs, its
stored records and its code. This page is the cast. You don't need to know any cryptography to
use safebyok; if you do, the last column of each table gives the usual term.

## What you handle

| Name           | What it is                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **whisper**    | The secret you store: any JSON value (a string, number, boolean, array or plain object), such as an API key or `{ apiKey, orgId }`. safebyok never looks inside it.                                |
| **lockbox**    | Holds one whisper, encrypted, together with its `boxlabel` and a public note your UI may show while the vault is locked.                                                                       |
| **vault**      | One user's set of lockboxes, named by your app's `applabel`, the signed-in user, and its own `vaultlabel`.                                                                                     |
| **passphrase** | What the user types to unlock their vault. It is not their login password, and safebyok never stores it or sends it anywhere.                                                                      |
| **mask**       | A function from `safebyok/utils` that shows a best-effort whiff of each end of a whisper, one plain line safe for a log or a reminder, so your UI can tell which API key a lockbox holds without revealing it. It is not a faithful copy: marks, invisible characters, bidirectional controls and spaces are dropped, though right-to-left letters are kept and may reorder their neighbours in a display. `mask` is intended for plain text; calling it with arbitrary blobs may give unusual behavior. Stripping every mark costs the vowels of scripts that write them as marks (Hindi `नमस्ते` comes out as `नमसत`); an API key is ASCII, and is untouched. Its result is public: show it, never trust it to hide more than it does. `mask(whisper, { head: 0, tail: 0 })` hides everything but the length. |

## Keys

safebyok has four keys. Each is a 256-bit AES-GCM key, named for whose it is, and none ever
leaves the user's device unencrypted. There are no public or private keys: everything is
symmetric.

| Name               | What it is                                                                                                                                                         | Standard term                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| **passphraseKey**  | Made from the passphrase and the passphraseSalt by the key deriver. Its only job is to wrap the vaultKey.                                                          | passphrase-derived KEK              |
| **vaultKey**       | The vault's random master key. It wraps every lockboxKey, and stays the same when the passphrase changes, so a new passphrase never rewrites a lockbox.            | key-encryption key (KEK)            |
| **lockboxKey**     | A random key for one lockbox, made fresh every time a whisper is stored. It encrypts that whisper.                                                                 | data-encryption key (DEK)           |
| **localUnlockKey** | Kept by this browser, and impossible to export from it. It wraps a copy of the vaultKey so that "remember this device" can unlock without the passphrase. It holds nothing about the device itself. | non-extractable, device-bound KEK |

Which key opens which:

```text
passphrase + passphraseSalt ──key deriver──> passphraseKey

passphraseKey   wraps    vaultKey    →  vaultKeyPassphraseWrapped   synced to every device
localUnlockKey  wraps    vaultKey    →  vaultKeyLocalWrapped        this device only
vaultKey        wraps    lockboxKey  →  lockboxKeyWrapped           one per lockbox
lockboxKey      ciphers  whisper     →  whisperCiphered             one per lockbox
```

## Encrypted forms

A key that has been encrypted is **Wrapped**; a whisper that has been encrypted is **Ciphered**.
Each is a pair: its cipherIv and its ciphertext. safebyok exports the pair's one shape as the
**`Ciphered`** type -- `{ cipher_iv_b64, ciphertext_b64 }`, each half base64url text (the `_b64`
suffix) -- so every encrypted field in a stored record is plain JSON any storage layer can hold
as-is.

| Name                          | What it is                                                                                         | Standard term       |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------- |
| **whisperCiphered**           | The whisper, encrypted under its lockboxKey.                                                       | ciphertext          |
| **lockboxKeyWrapped**         | The lockboxKey, encrypted under the vaultKey and stored beside its whisperCiphered.                | wrapped DEK         |
| **vaultKeyPassphraseWrapped** | The vaultKey, encrypted under the passphraseKey. Synced to every device through your storage.      | wrapped KEK         |
| **vaultKeyLocalWrapped**      | The vaultKey, encrypted under the localUnlockKey. Never leaves this device.                        | device-wrapped KEK  |

## Ingredients and bindings

None of these is secret. Each is stored in the clear or rebuilt when needed, and if any one is
wrong or has been tampered with, decryption fails.

| Name                     | What it is                                                                                                                                                           | Standard term        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **passphraseSalt**       | Random bytes (16 under the supplied keyDeriverSpec) fed to the key deriver with the passphrase; replaced whenever the passphrase changes.                            | salt                 |
| **keyDeriverSpec**       | The recipe that turns a passphrase into the passphraseKey: Argon2id's parameters under a keyDeriverLabel. safebyok supplies one, `Argon2idWebV1`: 64 MiB of memory, 3 passes, 1 lane, a 16-byte salt and a 32-byte result. A host may choose its own. | KDF parameters       |
| **keyDeriverLabel**      | The keyDeriverSpec's name (`argon2id_web_v1` for the supplied one), stored with each vault so that the vault says how it was made. A label always means the same parameters. | KDF identifier       |
| **key deriver**          | What makes the passphraseKey under a keyDeriverSpec: `argon2idWebV1Deriver` for the supplied one, `argon2idDeriver(spec)` for a host's own. One standing in for a supplied spec carries its parameters, or the vault refuses it. | KDF                  |
| **cipherIv**             | 12 random bytes, fresh for every encryption, stored beside the ciphertext it opens.                                                                                  | IV, nonce            |
| **cipherAdditionalData** | The context an encryption is bound to: the record's format, which app, user and vault, which lockbox and revision (or, for a key wrap, which passphraseEpoch), and which field it is. It is rebuilt rather than stored, so ciphertext copied anywhere else will not open. | associated data (AAD) |
| **ciphertext**           | The encrypted bytes, with their authentication tag on the end.                                                                                                       | ciphertext           |
| **vaultId**              | A random id minted when the vault is made, and never changed; part of every cipherAdditionalData.                                                                   | --                   |
| **revisionId**           | A fresh id for each write of a lockbox. It is part of the cipherAdditionalData; storage refuses (`stale_write`) a write made from a stale read.                     | version, CAS token   |
| **passphraseEpoch**      | A counter that goes up whenever the passphrase changes, so other devices and remembered unlocks know to ask for it again.                                            | key epoch            |

## Names, records and times

How a vault is addressed, what the storage layer holds, and when. A label is, by default
(`Label`), lowercase words of letters and digits joined by single underscores, such as
`anthropic_api_key`; a host may check its labels, user ids and notes with its own `validators`
instead, which admit what they will.

| Name                            | What it is                                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **applabel**                    | Your app's own label, so several apps can share one backend without colliding. Stored as `applabel`.                                                                        |
| **vaultlabel**                  | The label of one of a user's vaults, such as `main`. Stored as `vaultlabel`.                                                                                                |
| **boxlabel**                    | The label of a lockbox within its vault: what you pass to `store`, `read`, `use` and `erase`. Stored as `boxlabel`.                                                         |
| **userId**                      | The signed-in user's id from your own auth, the one name in a scope that is not a label: by default text of 1 to 100 characters (`UserId`). Stored as `user_id`.            |
| **scope**                       | An applabel, a userId and a vaultlabel together: it names one vault (`VaultScope`).                                                                                         |
| **note**                        | A lockbox's public text, by default up to 256 characters (`LockboxNote`), which your UI may show while the vault is locked. It is never encrypted: never put a secret in it. |
| **bundle**                      | The one record per vault that every device syncs (`VaultBundle`): the vaultId, passphraseEpoch, keyDeriverLabel, passphraseSalt and vaultKeyPassphraseWrapped. Nothing in it opens without the passphrase. |
| **device unlock**               | (Also a remembered unlock.) What a device keeps to unlock without the passphrase (`DeviceUnlock`): the localUnlockKey, the vaultKeyLocalWrapped, the vaultId, the passphraseEpoch and the askPassphraseAt. It stays on the device. |
| **vaultDB**                     | The storage plug-in for what syncs: bundles and lockboxes, ciphertext only (`VaultDB`; `localVaultDB`, `idbVaultDB` and `convexVaultDB` are supplied).                      |
| **deviceDB**                    | The storage plug-in for this device's device unlock (`DeviceDB`; `memoryDeviceDB` and `idbDeviceDB` are supplied).                                                          |
| **registeredAt**, **changedAt** | When a lockbox was first stored, and when its whisper last changed; the bundle has a registeredAt too: when the vault was made. Stored as `registered_at` and `changed_at`. |
| **askPassphraseAt**             | The instant from which a device stops honoring its device unlock and asks for the passphrase again (`ask_passphrase_at` in the record). `FarFuture` means "until it is locked". |
| **forcePassphraseReentryHours** | The `openVault` option for how long a device stays unlocked after the passphrase is entered. The default is 168 (`ForcePassphraseReentryHours`); `Infinity` means until it is locked. A vault reports the window it was opened with as `reentryWindowMs`, in milliseconds; `Infinity` reads as `ForeverMs`. |
| **EpochMillis**                 | Every time safebyok keeps: whole UTC milliseconds since 1970, from `FarPast` (1981) to `FarFuture` (2255). The bounds catch seconds and microseconds passed by mistake.      |
| **format**                      | The tag at the head of every stored record (`safebyok-vault-v1`, `safebyok-lockbox-v1`, `safebyok-unlock-v1`). It is also the first part of the cipherAdditionalData.        |
| **validators**                  | The `openVault` option holding a host's own checks for its labels, user id and note (`VaultValidators`), each replacing safebyok's default. A check only checks: what passes is kept as given. |
| **clock**, **logger**           | Two options your app may pass to `openVault`: a source of the time (`Clock`), and a place for the vault to say what it has no one to throw to (`VaultLogger`).             |

## Other credentials

| Name             | What it is                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **API key**      | A user's credential for some other service, and the usual thing a whisper holds. safebyok never names or inspects it.      |
| **access token** | Your app's own login credential, which your storage adapter may send to your backend. It never goes into a vault.       |

## Words safebyok does not use

* **key, alone.** A key is always one of the four above, by name. An entry's name in a map or a
  storage address is a `ckey`.
* **data, contents, payload.** The secret is a whisper; encrypted, it is a whisperCiphered.
* **device key.** The key behind "remember this device" is the localUnlockKey.
* **KEK, DEK, KDF, AAD.** They appear above only so a security reviewer can map safebyok's names
  onto the usual ones. Nothing in safebyok's API asks you to learn them.

Stored records spell every name in underbar_case: `whisper_ciphered`, `key_deriver_label`.

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
| **mask**       | A function from `safebyok/utils` that hides all but a few characters of a string, so your UI can show which API key a lockbox holds without revealing it. Its result is public: show it, never trust it to hide more than it does. safebyok offers a careful one and a stars-only one, or you can plug in your own. |

## Keys

safebyok has four keys. Each is a 256-bit AES-GCM key, named for whose it is, and none ever leaves the
user's device unencrypted. There are no public or private keys: everything is symmetric.

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
| **passphraseSalt**       | 16 random bytes fed to the key deriver with the passphrase; replaced whenever the passphrase changes.                                                               | salt                 |
| **keyDeriverSpec**       | The one fixed recipe that turns a passphrase into the passphraseKey: Argon2id over 64 MiB of memory, 3 passes, 1 lane, a 16-byte salt and a 32-byte result.          | KDF parameters       |
| **keyDeriverLabel**      | The keyDeriverSpec's name, `argon2id_web_v1`, stored with each vault so that the vault says how it was made.                                                         | KDF identifier       |
| **cipherIv**             | 12 random bytes, fresh for every encryption, stored beside the ciphertext it opens.                                                                                  | IV, nonce            |
| **cipherAdditionalData** | The context an encryption is bound to: which app, user and vault, which lockbox and revision, and for what purpose. It is rebuilt rather than stored, so ciphertext copied anywhere else will not open. | associated data (AAD) |
| **ciphertext**           | The encrypted bytes, with their authentication tag on the end.                                                                                                       | ciphertext           |
| **vaultId**              | A random id minted when the vault is made, and never changed; part of every cipherAdditionalData.                                                                   | --                   |
| **revisionId**           | A fresh id for each write of a lockbox. It is part of the cipherAdditionalData; storage refuses (`stale_write`) a write made from a stale read.                     | version, CAS token   |
| **passphraseEpoch**      | A counter that goes up whenever the passphrase changes, so other devices and remembered unlocks know to ask for it again.                                            | key epoch            |
| **whisperSchemaVersion** | Your own version number for the shape of a whisper, so you can migrate old ones after reading them.                                                                  | --                   |

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
* **KEK, DEK, KDF, AAD.** They appear above only so a security reviewer can map safebyok's names onto
  the usual ones. Nothing in safebyok's API asks you to learn them.

Stored records spell every name in underbar_case: `whisper_ciphered`, `key_deriver_label`.

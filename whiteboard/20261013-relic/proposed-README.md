# BYOKVault

`BYOKVault` is a browser-side encrypted vault for user-provided API keys and other small JSON secrets.

It is intended for applications where users bring their own API token, such as an Anthropic API key, and the application should be able to synchronize encrypted key material between devices without storing the usable token in its backend database.

## What it provides

- Passphrase-protected vaults synchronized through a remote `VaultDB`
- Client-side encryption using:
  - `argon2id-web-v1` for passphrase derivation
  - AES-256-GCM through WebCrypto for encryption and key wrapping
- Multiple encrypted lockboxes per vault
- Typed JSON contents validated with Zod
- Optional “remember this device” unlocks using IndexedDB
- Optional recovery kits
- Compare-and-swap support for multi-device writes
- React-friendly lifecycle operations: initialize, unlock, lock, refresh, rotate, store, and use

## What it does not provide

BYOKVault does not proxy requests to Anthropic or another external provider.

Your application decrypts a token on the user's device and makes the API request directly from that device.

```text
User browser
  ├─ decrypts Anthropic API key in memory
  └─ sends HTTPS request directly to api.anthropic.com

Your backend / Convex
  └─ stores encrypted vault records only
```

This design means your backend does not need access to a user's external API key.

---

# Installation

Install the vault package and its browser dependencies.

```sh
npm install @your-org/byok-vault zod hash-wasm idb-keyval
```

If your application uses Convex:

```sh
npm install convex
```

If your application uses the recovery-kit feature:

```sh
npm install @scure/bip39
```

The exact package names may differ based on your distribution, but the expected dependencies are:

| Dependency | Purpose |
|---|---|
| `zod` | Validating stored and decrypted JSON data |
| `hash-wasm` | Argon2id passphrase derivation |
| Browser `crypto.subtle` | AES-GCM encryption and key wrapping |
| `idb-keyval` | IndexedDB remembered-device storage |
| `@scure/bip39` | Optional recovery phrase support |
| `convex` | Only required for `ConvexVaultDB` |

---

# Security model

A vault is protected by a user passphrase.

```text
Passphrase
  │
  ├─ Argon2id (`argon2id-web-v1`)
  │
  ▼
Passphrase-derived key
  │
  ├─ decrypts
  ▼
VaultKey
  │
  ├─ decrypts per-lockbox data keys
  │
  ▼
Encrypted JSON contents
```

The remote database stores records such as:

- Argon2 salt
- KDF profile metadata
- Encrypted VaultKey envelope
- Encrypted lockbox DEKs
- Encrypted JSON content
- Non-secret metadata such as `"anthropic"` or `"Personal account"`

The remote database does not need to receive:

- User passphrases
- Decrypted API tokens
- Vault keys
- Per-lockbox encryption keys
- Decrypted lockbox JSON

## Pinned cryptographic profile

BYOKVault uses one profile:

```text
argon2id-web-v1
  memory:       64 MiB
  iterations:   3
  parallelism:  1
  salt:         16 bytes
  output:       32 bytes
```

The browser must support:

- WebAssembly, for Argon2id
- Web Workers, recommended for running Argon2id without blocking the UI
- WebCrypto AES-GCM
- IndexedDB, if remembered-device unlock is enabled

Most current versions of Chrome, Edge, Firefox, and Safari support these features.

A browser or embedded webview which cannot load the Argon2id WebAssembly module can display public vault metadata, but it cannot initialize or unlock a vault using a passphrase.

---

# Choosing a remote database adapter

BYOKVault accepts a `VaultDB` adapter.

Two adapters are provided:

| Adapter | Use when |
|---|---|
| `RestVaultDB` | Your backend exposes normal authenticated HTTP endpoints |
| `ConvexVaultDB` | Your application already uses Convex for authenticated data and reactive queries |

Both adapters are expected to store encrypted vault records only.

## `RestVaultDB`

Use `RestVaultDB` when your application has a REST API, GraphQL API, tRPC service, or another authenticated HTTP backend.

Your backend generally needs endpoints equivalent to:

```text
GET    /vaults/:vaultLabel
PUT    /vaults/:vaultLabel
GET    /vaults/:vaultLabel/lockboxes/:boxLabel
PUT    /vaults/:vaultLabel/lockboxes/:boxLabel
GET    /vaults/:vaultLabel/lockboxes
DELETE /vaults/:vaultLabel/lockboxes/:boxLabel
```

The backend should:

1. Authenticate the current application user.
2. Authorize access to the requested vault.
3. Store and return ciphertext records without attempting to decrypt them.
4. Enforce compare-and-swap expectations for bundle epochs and lockbox key IDs.

Example construction:

```ts
import {
  BYOKVault,
  RestVaultDB,
  BrowserDeviceDB,
  BrowserCryptoProvider,
} from "@your-org/byok-vault";

const vaultDB = new RestVaultDB({
  baseUrl: "https://api.example.com",
  getAccessToken: async () => auth.getAccessToken(),
});

const vault = await BYOKVault.findOrCreate(
  "default",
  {
    vaultDB,
    deviceDB: new BrowserDeviceDB(),
    crypto: new BrowserCryptoProvider(),
  },
  {
    schemas: vaultSchemas,
    defaultRememberDurationMs: 1000 * 60 * 60 * 24 * 7,
  },
);
```

## `ConvexVaultDB`

Use `ConvexVaultDB` when Convex is your application database.

The Convex adapter typically maps vault operations to Convex queries and mutations:

| Vault operation | Convex operation |
|---|---|
| `getVaultBundle` | Query |
| `putVaultBundle` | Mutation with epoch compare-and-swap |
| `getLockbox` | Query |
| `putLockbox` | Mutation with key ID compare-and-swap |
| `listLockboxes` | Query |
| `deleteLockbox` | Mutation |
| `subscribeToVaultBundle` | Reactive query subscription |
| `subscribeToLockboxes` | Reactive query subscription |

Example construction:

```ts
import {
  BYOKVault,
  ConvexVaultDB,
  BrowserDeviceDB,
  BrowserCryptoProvider,
} from "@your-org/byok-vault";

const vaultDB = new ConvexVaultDB({
  convex,
  api: {
    getVaultBundle: api.vaults.getBundle,
    putVaultBundle: api.vaults.putBundle,
    getLockbox: api.vaults.getLockbox,
    putLockbox: api.vaults.putLockbox,
    listLockboxes: api.vaults.listLockboxes,
    deleteLockbox: api.vaults.deleteLockbox,
  },
});

const vault = await BYOKVault.findOrCreate(
  "default",
  {
    vaultDB,
    deviceDB: new BrowserDeviceDB(),
    crypto: new BrowserCryptoProvider(),
  },
  {
    schemas: vaultSchemas,
    defaultRememberDurationMs: 1000 * 60 * 60 * 24 * 7,
  },
);
```

## Convex storage notes

A Convex schema will usually need two encrypted-record tables:

```text
vaultBundles
  - authenticated owner identifier
  - vaultLabel
  - vaultId
  - epoch
  - salt
  - kdfProfile
  - passphraseVaultKey
  - recovery, optional
  - timestamps

vaultLockboxes
  - authenticated owner identifier
  - vaultLabel
  - boxLabel
  - keyId
  - wrappedDEK
  - data
  - public metadata
  - timestamps
```

Use Convex byte fields for ciphertext and IV data where practical. Base64 encoding is also possible, but adds size and encoding overhead.

Convex access control remains important. Encryption protects database contents; authorization limits who can fetch encrypted records in the first place.

---

# Defining vault contents

A vault is generic over a Zod schema registry.

Each known lockbox label has a schema describing its decrypted JSON content.

```ts
import { z } from "zod";

export const vaultSchemas = {
  "anthropic:personal": z.object({
    apiToken: z.string().min(1),
  }),

  "anthropic:work": z.object({
    apiToken: z.string().min(1),
  }),

  "openai:development": z.object({
    apiToken: z.string().min(1),
    organizationId: z.string().optional(),
  }),
} as const;
```

This gives typed access:

```ts
await vault.store(
  "anthropic:personal",
  { apiToken: "sk-ant-..." },
  {
    meta: {
      service: "anthropic",
      hint: "Personal account",
      last4: "abcd",
    },
  },
);
```

The `apiToken` is encrypted. The metadata object is intentionally available while the vault is locked.

Avoid placing secret information in metadata fields.

Good metadata:

```ts
{
  service: "anthropic",
  hint: "Work account",
  last4: "A1B2",
}
```

Poor metadata:

```ts
{
  service: "anthropic",
  hint: "sk-ant-api03-this-is-the-full-key",
}
```

---

# React integration

A common pattern is:

1. Create one vault instance after authentication is established.
2. Place that vault instance in React context.
3. Subscribe to vault status changes.
4. Do not place decrypted secrets in React state, Redux, Zustand, URLs, logs, analytics, or error reporting.

## Vault provider

```tsx
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const VaultContext = createContext<BYOKVault<typeof vaultSchemas> | null>(null);

export function VaultProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [vault, setVault] =
    useState<BYOKVault<typeof vaultSchemas> | null>(null);

  useEffect(() => {
    let disposed = false;

    async function openVaultHandle() {
      const instance = await BYOKVault.findOrCreate(
        "default",
        {
          vaultDB,
          deviceDB,
          crypto,
        },
        {
          schemas: vaultSchemas,
          defaultRememberDurationMs: 1000 * 60 * 60 * 24 * 7,
          autoLockOn: "hidden",
        },
      );

      if (disposed) {
        await instance.destroy();
        return;
      }

      setVault(instance);
    }

    void openVaultHandle();

    return () => {
      disposed = true;
      void vault?.destroy();
    };
  }, []);

  return (
    <VaultContext.Provider value={vault}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault() {
  const vault = useContext(VaultContext);

  if (!vault) {
    throw new Error("VaultProvider is not ready");
  }

  return vault;
}
```

## Subscribing to vault state

```tsx
function useVaultStatus() {
  const vault = useVault();
  const [status, setStatus] = useState(vault.status());

  useEffect(() => {
    setStatus(vault.status());
    return vault.subscribe(setStatus);
  }, [vault]);

  return status;
}
```

A UI can then handle states explicitly:

```tsx
function VaultGate() {
  const status = useVaultStatus();

  switch (status.state) {
    case "absent":
      return <CreateVaultScreen />;

    case "locked":
      return <UnlockVaultScreen />;

    case "unlocked":
      return <VaultContents />;

    case "stale":
      return <PassphraseChangedElsewhereScreen />;

    case "destroyed":
      return null;
  }
}
```

---

# Creating a vault

When `status().state === "absent"`, ask the user to choose a vault passphrase.

```ts
await vault.initialize(passphrase, {
  remember: true,
  rememberDurationMs: 1000 * 60 * 60 * 24 * 7,
});
```

A vault passphrase is separate from the user's normal application login password.

A passphrase should ideally be:

- A password-manager-generated value, or
- Several random words, or
- A long unique passphrase not reused elsewhere

The passphrase is used to derive the encryption key locally. It should not be sent to `VaultDB`, Convex, analytics, error reporting, or logging systems.

---

# Unlocking a vault

For an existing vault on a new device:

```ts
await vault.unlock(passphrase, {
  remember: true,
  rememberDurationMs: 1000 * 60 * 60 * 24 * 7,
});
```

If the user does not select “remember this device,” the decrypted vault key remains available only in application memory until the vault is locked, the page is reloaded, or the application is destroyed.

## Remembered-device unlock

When `remember: true` is used:

1. The browser creates or reuses a local non-extractable device key.
2. The vault key is encrypted with that device key.
3. The encrypted vault key is stored in IndexedDB with an expiration time.
4. On a later visit, the device can silently unlock if:
   - the cache has not expired,
   - site data has not been cleared,
   - the vault epoch has not changed,
   - the browser still has the device key.

Remembered unlock is a convenience feature, not a replacement for the passphrase.

A user can disable remembered unlock by calling:

```ts
await vault.lock({ forgetDevice: true });
```

---

# Storing an API token

Store API tokens in a lockbox.

```ts
await vault.store(
  "anthropic:personal",
  {
    apiToken: anthropicApiKey,
  },
  {
    meta: {
      service: "anthropic",
      hint: "Personal Anthropic account",
      last4: anthropicApiKey.slice(-4),
    },
  },
);
```

Each `store()` operation creates fresh encryption material for that lockbox revision:

- A new lockbox DEK
- A new AES-GCM IV
- A new encrypted DEK envelope
- A new lockbox `keyId`

The old ciphertext is replaced through compare-and-swap semantics, which helps prevent accidental overwrite by multiple devices.

---

# Using an API token

Use `vault.use()` to scope decrypted contents to a callback.

```ts
const response = await vault.use(
  "anthropic:personal",
  async ({ apiToken }) => {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiToken,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
      }),
    });
  },
);
```

The callback receives decrypted content in ordinary JavaScript memory. Avoid doing the following inside the callback:

```ts
console.log(apiToken);
setApiTokenInReactState(apiToken);
analytics.track("token-used", { apiToken });
throw new Error(`Failed with token ${apiToken}`);
```

The callback pattern does not make JavaScript strings erasable, but it makes the intended lifetime of decrypted data explicit and discourages long-lived storage in UI state.

---

# Anthropic browser requests

Anthropic requests should go directly from the browser to Anthropic when the objective is to keep the API key unavailable to your backend.

This requires Anthropic browser-access support and appropriate CORS behavior.

Depending on the Anthropic SDK or API configuration, browser requests may require an explicit browser-access acknowledgement header or SDK option.

For example, with the Anthropic SDK, consult the current Anthropic documentation for its browser configuration. Many SDK versions use an option similar to:

```ts
new Anthropic({
  apiKey,
  dangerouslyAllowBrowser: true,
});
```

The exact browser-access API can change, so use the current Anthropic SDK documentation as the source of truth.

If you route requests through a Convex action, server route, or another backend proxy, that server component will receive the decrypted API key during request handling. That can still be an acceptable product decision, but it is a different trust model.

---

# Listing lockboxes while locked

Lockbox summaries are available without unlocking the vault.

```ts
const boxes = await vault.list();
```

Example result:

```ts
[
  {
    boxLabel: "anthropic:personal",
    keyId: "01J...",
    meta: {
      service: "anthropic",
      hint: "Personal Anthropic account",
      last4: "ABCD",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    },
  },
];
```

This can support UI such as:

```text
Your connected keys

• Anthropic — Personal account — ••••ABCD
• Anthropic — Work account — ••••WXYZ
```

Do not treat metadata as encrypted.

---

# Refreshing across devices

Call `refresh()` when:

- The application regains focus.
- A user opens vault settings.
- A Convex reactive query reports a vault change.
- A request fails because a lockbox was deleted or replaced elsewhere.

```ts
const status = await vault.refresh();
```

If another device adds a lockbox but does not rotate the passphrase, the current device can usually access the new lockbox without another passphrase prompt.

If another device rotates the passphrase, the vault bundle epoch changes.

In that case `refresh()` transitions the local instance to:

```ts
{
  state: "stale",
  localEpoch: 3,
  remoteEpoch: 4,
}
```

The application should show a message such as:

```text
Your vault passphrase was changed on another device.
Enter the current passphrase to continue.
```

Then call:

```ts
await vault.unlock(currentPassphrase);
```

---

# Rotating a passphrase

A passphrase rotation changes the passphrase-derived wrapping key and increments the vault epoch.

```ts
await vault.rotate(oldPassphrase, newPassphrase);
```

The vault's random VaultKey remains stable, so lockbox ciphertext does not need to be rewritten.

This means rotating a passphrase is relatively lightweight even if the vault contains many lockboxes.

After rotation:

- Old remembered-device unlocks become stale.
- Other devices must unlock using the new passphrase.
- Existing lockboxes remain readable after unlock.

---

# Rotating one lockbox

Use `rotateLockbox()` when you want to re-encrypt a particular lockbox under a fresh lockbox DEK.

```ts
await vault.rotateLockbox("anthropic:personal");
```

Typical reasons include:

- The user replaced an API key with a new external-provider key.
- You want to rewrite the encrypted record as a maintenance step.
- You suspect a local lockbox key may have been exposed while the vault was unlocked.

Usually, replacing the external API token with `store()` is sufficient because `store()` already creates a fresh DEK and lockbox revision.

---

# Removing a lockbox

```ts
await vault.remove("anthropic:personal");
```

This removes the encrypted record from the remote `VaultDB`.

If the external token should no longer be usable, also revoke or rotate it with the external provider, such as Anthropic.

Deleting an encrypted copy from your database does not revoke an API key that was already issued by Anthropic.

---

# Recovery kits

A recovery kit is an optional mnemonic-based alternate path to the vault key.

```ts
const recoveryKit = await vault.createRecoveryKit(passphrase);
```

Display the phrase to the user once and encourage them to store it outside the application:

```text
Write this recovery phrase down and store it somewhere safe.
Anyone with this phrase may be able to unlock your vault.
```

Do not:

- Store the phrase in your own database
- Send the phrase to analytics
- Put it in browser local storage
- Include it in support tickets
- Automatically download it to an unprotected text file

Recovery unlock:

```ts
await vault.unlockWithRecovery(recoveryPhrase, {
  remember: false,
});
```

The recovery route uses the same pinned Argon2id WebAssembly profile as normal passphrase unlock. It is therefore useful for passphrase loss, but it does not make an environment that blocks Argon2id capable of decrypting the vault.

To remove recovery access:

```ts
await vault.revokeRecoveryKit(passphrase);
```

---

# Error handling

Vault methods may reject with an error containing a stable `code`.

```ts
try {
  await vault.unlock(passphrase);
} catch (error) {
  if (isVaultError(error)) {
    switch (error.code) {
      case "WrongPassphrase":
        setFormError("That passphrase did not unlock this vault.");
        return;

      case "CapabilityUnavailable":
        setFormError(
          "This browser cannot run the encryption required by this vault.",
        );
        return;

      case "VaultConflict":
      case "StaleVault":
        await vault.refresh();
        setFormError("Vault data changed elsewhere. Please try again.");
        return;

      case "IntegrityFailure":
        setFormError(
          "Encrypted vault data could not be verified. Contact support.",
        );
        return;
    }
  }

  throw error;
}
```

Important error categories:

| Code | Meaning |
|---|---|
| `WrongPassphrase` | The supplied passphrase did not decrypt the VaultKey |
| `CapabilityUnavailable` | The current browser cannot run the pinned profile or required WebCrypto operation |
| `VaultLocked` | A data operation was attempted before unlock |
| `VaultAbsent` | The requested vault has not been initialized |
| `VaultAlreadyExists` | Another device initialized the vault first |
| `VaultConflict` | Compare-and-swap failed because remote data changed |
| `StaleVault` | Another device rotated the passphrase or otherwise advanced the vault epoch |
| `LockboxAbsent` | The requested lockbox does not exist |
| `LockboxConflict` | Another device changed the lockbox during an update |
| `IntegrityFailure` | AES-GCM authentication failed; stored data may be corrupted or tampered with |
| `SchemaViolation` | Stored or decrypted data did not match its expected Zod schema |
| `Cancelled` | A cancellable operation, such as Argon2id derivation, was aborted |

Treat `IntegrityFailure` differently from `WrongPassphrase`. A wrong passphrase is a normal user error. Integrity failure should be surfaced as a data corruption or tampering issue.

---

# Sign-out and cleanup

When the user signs out of your application:

```ts
await vault.lock({ forgetDevice: true });
await deviceDB.clearAll();
```

This removes the local remembered unlock cache and browser-local device keys for the current browser profile.

It does not delete encrypted vault records from `VaultDB`.

---

# Content Security Policy

A secure deployment should use a strict Content Security Policy. Since the vault handles user-provided API keys in the browser, reducing XSS exposure is especially important.

A typical policy will vary by application, but consider:

- Restricting scripts to your own origin.
- Avoiding arbitrary third-party scripts.
- Avoiding inline scripts where possible.
- Restricting network connections with `connect-src`.
- Allowing the Argon2id WebAssembly asset to load from your own origin.
- Allowing direct connections to the external API host, for example `https://api.anthropic.com`.

Example conceptual directives:

```text
script-src 'self'
connect-src 'self' https://api.anthropic.com
worker-src 'self' blob:
```

Test the production CSP early. An overly restrictive CSP can prevent the Argon2id worker or WebAssembly module from loading.

---

# Operational recommendations

## Good defaults

- Use a seven-day remembered-device duration.
- Auto-lock on tab hidden for higher-sensitivity applications.
- Keep API token plaintext out of React state.
- Use direct browser-to-provider API requests for the strongest server-blind model.
- Encourage users to create external-provider spending limits.
- Encourage users to revoke keys they no longer use.
- Offer recovery kits, while clearly explaining their sensitivity.
- Use a strict CSP and minimize third-party JavaScript.

## Product limitations to explain to users

- Forgetting both the vault passphrase and recovery phrase can make encrypted vault contents unrecoverable.
- Clearing browser site data removes remembered-device unlocks.
- Browser extensions, malicious scripts, compromised devices, and active XSS may access a decrypted token while the vault is unlocked.
- The external API provider receives the API key when the user makes a request.
- API-key limits, spend caps, and revocation controls at the external provider remain important.

---

# Example end-to-end flow

```ts
const vault = await BYOKVault.findOrCreate(
  "default",
  {
    vaultDB: new ConvexVaultDB({ convex, api }),
    deviceDB: new BrowserDeviceDB(),
    crypto: new BrowserCryptoProvider(),
  },
  {
    schemas: vaultSchemas,
    defaultRememberDurationMs: 1000 * 60 * 60 * 24 * 7,
    autoLockOn: "hidden",
  },
);

if (vault.status().state === "absent") {
  await vault.initialize(userChosenPassphrase, {
    remember: true,
  });
}

if (vault.status().state === "locked") {
  await vault.unlock(userEnteredPassphrase, {
    remember: true,
  });
}

await vault.store(
  "anthropic:personal",
  {
    apiToken: userEnteredAnthropicKey,
  },
  {
    meta: {
      service: "anthropic",
      hint: "Personal",
      last4: userEnteredAnthropicKey.slice(-4),
    },
  },
);

const result = await vault.use(
  "anthropic:personal",
  async ({ apiToken }) => {
    return fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiToken,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 256,
        messages: [
          {
            role: "user",
            content: "Explain zero-knowledge encryption in one sentence.",
          },
        ],
      }),
    });
  },
);
```
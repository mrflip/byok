Not explicitly. The prior interface has a `vaultLabel`, and relies on `VaultDB` authorization to scope that label to the authenticated application user, but it does not model the authenticated user as part of the vault’s local identity.

That is sufficient for a carefully written `ConvexVaultDB`, but it is not sufficient to safely manage browser-local remembered unlocks across login/logout/account-switch flows.

You should add an explicit **vault owner / principal scope** to the interface.

## Recommended terminology

- **Principal**: the currently authenticated application identity. Usually your stable Convex/Auth user subject, not an email address.
- **Principal ID**: stable opaque identifier for that identity, such as Clerk subject or Convex user ID.
- **Vault scope**: `(principalId, vaultLabel)`.
- **Local vault cache**: device-local remembered-unlock material for one vault scope.
- **Remote vault**: encrypted bundle and lockboxes stored through `VaultDB`.

A `vaultLabel` such as `"default"` is not globally unique. It is only meaningful within a principal scope:

```text
(user_A, "default") → User A's encrypted vault
(user_B, "default") → User B's encrypted vault
```

## What should change

### 1. Make the principal explicit at vault construction

`findOrCreate` should receive a stable authenticated identity:

```ts
type VaultPrincipal = {
  /**
   * Stable application-auth identity.
   *
   * Use an opaque provider subject / user ID, not an email address.
   * An email can change, be reused, or be shared across identity providers.
   */
  principalId: PrincipalId;

  /**
   * Optional display-only value for local diagnostics.
   * It should not be used as a security identifier.
   */
  displayName?: string;
};
```

The factory becomes conceptually:

```ts
BYOKVault.findOrCreate({
  principal,
  vaultLabel,
  dependencies,
  options,
});
```

The vault’s effective identity is then:

```text
VaultScope = principalId + vaultLabel
```

This scope should be used by:

- `VaultDB` authorization and record lookup
- `DeviceDB` keys
- remembered-unlock cache records
- AEAD associated data
- subscription registration
- diagnostics and telemetry correlation, if any

### 2. Scope local cache records by principal

The earlier `DeviceVaultCache` should include `principalId`.

```ts
const DeviceVaultCacheSchema = z.object({
  format: z.literal("byok-device-cache-v1"),

  /**
   * The authenticated application identity that created this local cache.
   */
  principalId: PrincipalIdSchema,

  vaultLabel: VaultLabelSchema,
  vaultId: VaultIdSchema,
  epoch: z.number().int().positive(),

  vaultKey: DeviceVaultKeyEnvelopeSchema,

  createdAt: IsoTimestampSchema,
  expiresAt: IsoTimestampSchema,
});
```

Similarly, `DeviceDB` should not be keyed only by `vaultLabel`.

Its conceptual lookup key should be:

```text
(principalId, vaultLabel)
```

not:

```text
(vaultLabel)
```

Otherwise this sequence is unsafe:

1. Alice logs in.
2. Alice unlocks `"default"` and chooses “remember this device.”
3. Alice logs out.
4. Bob logs in on the same browser.
5. Bob opens a vault also called `"default"`.
6. The application accidentally finds Alice’s local remembered VaultKey.

Even if Bob cannot fetch Alice’s remote encrypted data, retaining Alice’s unlock material on a shared browser is not desirable.

### 3. Bind identity into AEAD associated data

Associated data should include the immutable vault owner identity as well as vault identifiers.

For example, the logical AAD context should include:

```text
format version
principalId
vaultId
vaultLabel
boxLabel
keyId
epoch
purpose
```

For example:

```text
byok-vault-v1 | principalId | vaultId | epoch | "passphrase-vault-key"
byok-lockbox-v1 | principalId | vaultId | boxLabel | keyId | "wrapped-dek"
byok-lockbox-v1 | principalId | vaultId | boxLabel | keyId | "contents"
```

This makes copied ciphertext fail authentication if it is moved between users, vaults, box labels, or revisions.

The `principalId` is not secret. It is a binding value, not encrypted content.

---

# Account-switch and sign-out behavior

The library should support two related mechanisms:

1. **Explicit cleanup from the application**
2. **Defensive automatic cleanup when the principal changes**

Your React app should use both.

## Explicit cleanup

When your app signs a user out, call something like:

```ts
await vaultManager.handleSignedOut();
```

That operation should:

- lock the current in-memory vault;
- release in-memory `VaultKey` and DEK handles;
- unsubscribe from Convex/reactive listeners;
- clear the active vault session;
- delete remembered-unlock cache entries for the signed-out principal, according to your chosen policy.

For a conservative product policy, signing out clears all local caches for that principal:

```text
clearPrincipal(principalId)
```

This means “remember this device for seven days” applies while the user remains signed in, but sign-out ends that trust relationship.

That is generally the right default for a shared-device-safe application.

## Defensive automatic cleanup on identity change

The library should also protect against applications forgetting to call logout cleanup.

The device layer should maintain an **active principal marker**:

```ts
type DeviceSessionMarker = {
  format: "byok-device-session-v1";
  principalId: PrincipalId;
  updatedAt: string;
};
```

When a vault is opened:

1. Read the active principal marker.
2. If no marker exists, set it to the current principal.
3. If the marker matches the current principal, proceed.
4. If the marker belongs to another principal:
   - lock and dispose any in-memory vault instance;
   - clear the previous principal’s remembered vault caches;
   - replace the active-principal marker;
   - continue as a new local session.

This handles a browser session where React state resets imperfectly, authentication changes in another tab, or a developer fails to explicitly call cleanup during an account switch.

## Important detail: clear local state, not remote vaults

On an account switch, automatically clear:

- remembered VaultKey cache records;
- browser-local device keys for the old principal;
- active in-memory vault handles;
- subscription handles;
- local lockbox list caches, if you keep any.

Do **not** automatically delete remote `VaultDB` records for the previous user. Those records are their encrypted vault and should remain available when they log in again.

---

# Suggested `DeviceDB` additions

The earlier interface should become principal-aware.

```ts
interface DeviceDB {
  getActivePrincipal(): Promise<PrincipalId | null>;

  setActivePrincipal(principalId: PrincipalId): Promise<void>;

  getDeviceKey(
    principalId: PrincipalId,
    vaultLabel: VaultLabel,
  ): Promise<CryptoKey | null>;

  ensureDeviceKey(
    principalId: PrincipalId,
    vaultLabel: VaultLabel,
  ): Promise<CryptoKey>;

  getVaultCache(
    principalId: PrincipalId,
    vaultLabel: VaultLabel,
  ): Promise<DeviceVaultCache | null>;

  putVaultCache(cache: DeviceVaultCache): Promise<void>;

  clearVault(
    principalId: PrincipalId,
    vaultLabel: VaultLabel,
  ): Promise<void>;

  /**
   * Used on sign-out or identity switch.
   */
  clearPrincipal(principalId: PrincipalId): Promise<void>;

  /**
   * Used only for full application/site reset.
   */
  clearAll(): Promise<void>;
}
```

For an IndexedDB implementation, use a key structure such as:

```text
device-key:{principalId}:{vaultLabel}
vault-cache:{principalId}:{vaultLabel}
```

Do not use a global key like:

```text
vault-cache:default
```

---

# Suggested `VaultDB` additions

Your `VaultDB` adapter should receive the principal scope as an explicit parameter, even though Convex also obtains the authenticated identity server-side.

```ts
interface VaultDB {
  getVaultBundle(
    principal: VaultPrincipal,
    vaultLabel: VaultLabel,
  ): Promise<VaultBundle | null>;

  putVaultBundle(
    principal: VaultPrincipal,
    bundle: VaultBundle,
    expectedEpoch: number | null,
  ): Promise<void>;

  // Same pattern for lockbox operations.
}
```

For `ConvexVaultDB`, the server should independently derive the principal from `ctx.auth`, not trust an arbitrary client-provided `principalId`.

The client-side `principalId` is useful for:

- local DeviceDB partitioning;
- AAD binding;
- checking that the returned bundle belongs to the expected account;
- React lifecycle cleanup.

The Convex function should still enforce:

```text
authenticated ctx.auth subject == requested vault record owner
```

---

# Broken-vault handling

“Broken vault” needs several distinct states. They should not all cause automatic deletion.

| Condition | Recommended response |
|---|---|
| Expired local remembered-unlock cache | Remove local cache; show locked state |
| Invalid/malformed local cache record | Remove local cache; fall back to passphrase unlock |
| Local device key missing | Remove local cache; fall back to passphrase unlock |
| Remote bundle schema invalid | Mark vault `corrupted`; do not overwrite or delete remotely automatically |
| AES-GCM verification failure for bundle or lockbox | Mark vault `integrityFailure`; do not auto-delete |
| Wrong passphrase | Return `WrongPassphrase`; preserve all data |
| Missing remote vault bundle | Return `absent` |
| Argon2id unavailable | Return capability-unavailable locked state; preserve data |
| Old local cache epoch after passphrase change | Delete local cache; transition to stale/locked |
| Current user does not match local cache principal | Delete that local cache; do not attempt unlock |

## Why remote corruption should not be auto-deleted

A malformed or undecryptable remote vault can be caused by:

- a deployment bug;
- a serialization mismatch;
- a partially completed migration;
- accidental data overwrite;
- an authorization bug;
- tampering;
- an older application version;
- a genuine user data-loss event.

Automatically deleting it turns a recoverable support or migration problem into permanent loss.

Instead, represent it explicitly:

```ts
type VaultStatus =
  | { state: "absent"; ... }
  | { state: "locked"; ... }
  | { state: "unlocked"; ... }
  | { state: "stale"; ... }
  | {
      state: "corrupted";
      vaultLabel: VaultLabel;
      principalId: PrincipalId;
      reason: "bundle-schema" | "integrity" | "unsupported-format";
      recoverable: boolean;
    }
  | { state: "destroyed"; ... };
```

A corrupted remote vault can offer controlled actions such as:

- retry fetch;
- download encrypted diagnostic/export data, if appropriate;
- contact support;
- explicitly discard and create a new vault;
- restore from a previous encrypted backup, if your storage system supports it.

That destructive reset should be an explicit user-confirmed operation, such as:

```text
destroyRemoteVault({ confirmation: "DELETE MY VAULT" })
```

and should require current application authentication. If the vault can still be unlocked, requiring the vault passphrase as confirmation is also reasonable.

---

# Recommended React lifecycle

At the application authentication boundary:

```text
Unauthenticated
  → dispose current vault manager
  → clear active in-memory references

Authenticated as user A
  → activate principal A
  → detect and clear stale local principal cache if needed
  → findOrCreate(A, "default")

Sign out user A
  → lock vault
  → clearPrincipal(A)
  → clear active principal marker

Authenticated as user B
  → activate principal B
  → findOrCreate(B, "default")
```

In a React app, this usually belongs near the same provider boundary that owns Convex authentication state—not deep inside a screen that happens to use Anthropic.

## Practical default policy

For your use case, I would use this policy:

- A vault is scoped to a stable authenticated user ID plus `vaultLabel`.
- Local remembered unlocks are scoped to the same pair.
- Sign-out clears that principal’s browser-local vault data.
- Switching users clears the prior principal’s browser-local vault data automatically.
- Invalid local cache data is cleared automatically.
- Invalid or integrity-failing remote data is preserved and reported as corrupted until the user explicitly resets it.
- The Convex adapter uses server-derived auth identity for all authorization checks.

So: the earlier design supports these behaviors, but it needs an explicit `PrincipalId` and a principal-aware `DeviceDB`/vault-manager layer to make them reliable rather than an application convention.
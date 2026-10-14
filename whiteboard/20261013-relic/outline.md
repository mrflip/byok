# BYOKVault — Interface Specification

The below follows /relic rules:
* adapt the **intent**, but not necessarily the concrete implementation, of the below
* Follow our style guide or conventions, not the code as written
* The code you write, and its documentation, should serve the future users of the library --
  decisions you made, differences to the relic code, and suchlike go in the progress and whiteboard channels, as usual

## Caveats

Specific things to fix in the migration:
* use our zod kit and style for defining types

Alterations:
* use branded strings for vaultlabel and boxlabel
* Is the below tied well enough to the authentication of the user?
* Should any other elements be mixed in, such as code version?



## Relic Starts here

Below is an interface-oriented design for a client-side BYOK vault using one pinned cryptographic profile:

- **Passphrase KDF:** `hash-wasm` Argon2id, run in a Web Worker
- **Encryption and key wrapping:** browser `crypto.subtle`, AES-256-GCM
- **Persistent device cache:** IndexedDB, e.g. through `idb-keyval`
- **Validation:** Zod
- **Optional recovery mnemonic:** `@scure/bip39`

The vault stores only encrypted records in `VaultDB`. The passphrase derives a key that unwraps a random vault key; that vault key wraps per-lockbox DEKs.

This extra vault-key layer is useful:

```text
passphrase
  │
  └─ Argon2id ──> Passphrase KEK
                     │
                     └─ AES-GCM unwrap ──> VaultKey
                                               │
                                               ├─ unwrap DEK for "anthropic-prod"
                                               │      └─ decrypt JSON contents
                                               │
                                               └─ unwrap DEK for "openai-dev"
                                                      └─ decrypt JSON contents
```

Changing the passphrase re-wraps the small `VaultKey`; it does not require rewriting every lockbox.

---

## Pinned cryptographic profile

```ts
import { z } from "zod";

/**
 * The sole passphrase KDF profile supported by this vault format.
 *
 * m: 64 MiB of Argon2 memory, expressed in KiB.
 * t: three Argon2 passes.
 * p: one lane, which is appropriate for a browser worker.
 *
 * The profile is stored in vault records so that the stored format is
 * self-describing and can be recognized by future versions of the library.
 */
export const Argon2idWebV1Schema = z.object({
  algorithm: z.literal("argon2id"),
  profile: z.literal("argon2id-web-v1"),

  /** Argon2 memory cost, in KiB: 64 MiB. */
  memoryKiB: z.literal(65_536),

  /** Argon2 iteration/time cost. */
  iterations: z.literal(3),

  /** Argon2 parallelism/lane count. */
  parallelism: z.literal(1),

  /** Random salt size used for passphrase derivation. */
  saltBytes: z.literal(16),

  /** Derived key material length. */
  outputBytes: z.literal(32),
});

export type Argon2idWebV1 = z.infer<typeof Argon2idWebV1Schema>;

export const ARGON2ID_WEB_V1: Argon2idWebV1 = {
  algorithm: "argon2id",
  profile: "argon2id-web-v1",
  memoryKiB: 65_536,
  iterations: 3,
  parallelism: 1,
  saltBytes: 16,
  outputBytes: 32,
};
```

There is no caller-selected KDF algorithm or parameter set. A device which cannot run the profile, such as one where WebAssembly is blocked, can inspect public metadata but cannot perform a passphrase unlock.

---

# Zod models

## Shared primitives

```ts
/**
 * Binary data held by the vault format.
 *
 * A VaultDB adapter may serialize this as Convex `v.bytes()`, ArrayBuffer,
 * base64url, or another transport representation. The vault-facing adapter
 * should return Uint8Array values after deserialization.
 */
export const BytesSchema = z.instanceof(Uint8Array);

/** A 96-bit AES-GCM nonce. */
export const AesGcmIvSchema = BytesSchema.refine(
  (value) => value.byteLength === 12,
  "AES-GCM IV must contain exactly 12 bytes",
);

/** A 256-bit symmetric-key value when represented transiently as bytes. */
export const KeyBytesSchema = BytesSchema.refine(
  (value) => value.byteLength === 32,
  "Expected a 32-byte key",
);

/**
 * User-visible locator for one vault.
 *
 * This is not intended to be secret. It is commonly derived from an account
 * scope plus a stable application namespace.
 */
export const VaultLabelSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._:-]+$/)
  .brand<"VaultLabel">();

export type VaultLabel = z.infer<typeof VaultLabelSchema>;

/**
 * User-visible name for a record inside a vault, for example:
 * - "anthropic:personal"
 * - "anthropic:work"
 * - "openai:development"
 *
 * It identifies a lockbox but is not intended to contain secret material.
 */
export const BoxLabelSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[a-zA-Z0-9._:/-]+$/)
  .brand<"BoxLabel">();

export type BoxLabel = z.infer<typeof BoxLabelSchema>;

/**
 * Opaque stable identifier generated for the vault.
 *
 * Unlike VaultLabel, this is immutable. It is used in AEAD associated data
 * so renaming a display label does not require re-encrypting every item.
 */
export const VaultIdSchema = z
  .string()
  .min(16)
  .max(128)
  .brand<"VaultId">();

export type VaultId = z.infer<typeof VaultIdSchema>;

/**
 * Opaque identifier for a particular lockbox revision.
 *
 * A new keyId is generated when store() replaces a lockbox or when
 * rotateLockbox() is called. It also acts as the optimistic-concurrency token.
 */
export const KeyIdSchema = z
  .string()
  .min(16)
  .max(128)
  .brand<"KeyId">();

export type KeyId = z.infer<typeof KeyIdSchema>;

export const IsoTimestampSchema = z.string().datetime({ offset: true });
```

---

## AES-GCM envelope models

```ts
/**
 * AES-GCM encrypted bytes.
 *
 * The authentication tag is included in ciphertext, as returned by WebCrypto.
 * The AAD is reconstructed from the record context and is not stored here.
 */
export const AesGcmEnvelopeSchema = z.object({
  iv: AesGcmIvSchema,
  ciphertext: BytesSchema,
});

export type AesGcmEnvelope = z.infer<typeof AesGcmEnvelopeSchema>;

/**
 * The passphrase-derived KEK encrypts the random VaultKey.
 *
 * Decrypting this envelope successfully proves that the supplied passphrase
 * derived the correct KEK. A separate passphrase-verifier field is therefore
 * not required.
 */
export const PassphraseVaultKeyEnvelopeSchema = AesGcmEnvelopeSchema;

export type PassphraseVaultKeyEnvelope = z.infer<
  typeof PassphraseVaultKeyEnvelopeSchema
>;

/**
 * Each lockbox has its own random 256-bit DEK. The VaultKey encrypts that DEK.
 */
export const WrappedDekSchema = AesGcmEnvelopeSchema;

export type WrappedDek = z.infer<typeof WrappedDekSchema>;

/**
 * A remembered device stores the VaultKey encrypted under a browser-generated,
 * non-extractable DeviceKey held in IndexedDB.
 */
export const DeviceVaultKeyEnvelopeSchema = AesGcmEnvelopeSchema;

export type DeviceVaultKeyEnvelope = z.infer<
  typeof DeviceVaultKeyEnvelopeSchema
>;
```

---

## Vault bundle

```ts
/**
 * Public and encrypted metadata required to unlock one vault.
 *
 * This record belongs in VaultDB. It does not contain the passphrase,
 * VaultKey, a lockbox DEK, or unencrypted lockbox content.
 */
export const VaultBundleSchema = z.object({
  format: z.literal("byok-vault-v1"),

  vaultLabel: VaultLabelSchema,
  vaultId: VaultIdSchema,

  /**
   * Increments when the passphrase envelope changes:
   * - passphrase rotation
   * - passphrase-derived key re-derivation
   * - recovery-based passphrase reset
   *
   * Device caches record the epoch they were created against. A mismatch
   * prompts the client to discard its remembered-unlock cache.
   */
  epoch: z.number().int().positive(),

  /**
   * The fixed, pinned Argon2id profile for this vault format.
   */
  kdfProfile: Argon2idWebV1Schema,

  /**
   * Random Argon2 salt for the current passphrase.
   */
  salt: BytesSchema.refine(
    (value) => value.byteLength === ARGON2ID_WEB_V1.saltBytes,
    "Unexpected Argon2 salt length",
  ),

  /**
   * Random VaultKey encrypted under:
   * Argon2id(passphrase, salt, ARGON2ID_WEB_V1).
   */
  passphraseVaultKey: PassphraseVaultKeyEnvelopeSchema,

  /**
   * Optional recovery route. It encrypts the same VaultKey as
   * passphraseVaultKey, under a key derived from a recovery mnemonic.
   *
   * The phrase itself is not stored in VaultDB.
   */
  recovery: z
    .object({
      format: z.literal("bip39-argon2id-web-v1"),
      salt: BytesSchema.refine(
        (value) => value.byteLength === ARGON2ID_WEB_V1.saltBytes,
        "Unexpected recovery salt length",
      ),
      vaultKey: AesGcmEnvelopeSchema,
      createdAt: IsoTimestampSchema,
    })
    .optional(),

  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type VaultBundle = z.infer<typeof VaultBundleSchema>;
```

---

## Lockbox models

```ts
/**
 * Plaintext metadata used for listing lockboxes while the vault is locked.
 *
 * Do not place API keys, full account identifiers, model prompts, endpoint
 * URLs containing credentials, or other sensitive data in this object.
 */
export const LockboxMetaSchema = z.object({
  /**
   * A service identifier such as "anthropic".
   * This is display metadata, not a secret.
   */
  service: z.string().min(1).max(128),

  /**
   * A user-facing description such as "Personal account".
   */
  hint: z.string().min(1).max(256).optional(),

  /**
   * Optional non-sensitive display suffix, e.g. the last four characters
   * of an API key. Applications may omit this entirely.
   */
  last4: z.string().min(1).max(16).optional(),

  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type LockboxMeta = z.infer<typeof LockboxMetaSchema>;

/**
 * An encrypted JSON value plus the per-record DEK envelope.
 *
 * One fresh DEK is generated for each store() operation. Replacing the
 * contents creates a new keyId, a new DEK, a new wrappedDEK, and a new data IV.
 */
export const LockboxRecordSchema = z.object({
  format: z.literal("byok-lockbox-v1"),

  vaultLabel: VaultLabelSchema,
  vaultId: VaultIdSchema,
  boxLabel: BoxLabelSchema,

  /**
   * Current revision and compare-and-swap token.
   */
  keyId: KeyIdSchema,

  /**
   * Random record DEK encrypted under the vault's VaultKey.
   */
  wrappedDEK: WrappedDekSchema,

  /**
   * JSON-encoded user contents encrypted under this record's DEK.
   */
  data: AesGcmEnvelopeSchema,

  /**
   * Application-controlled format version for decrypted JSON contents.
   *
   * This can be useful if the schema for a given box evolves over time.
   */
  contentVersion: z.number().int().positive().default(1),

  meta: LockboxMetaSchema,
});

export type LockboxRecord = z.infer<typeof LockboxRecordSchema>;

/**
 * The non-secret subset returned by listLockboxes().
 */
export const LockboxSummarySchema = z.object({
  boxLabel: BoxLabelSchema,
  keyId: KeyIdSchema,
  meta: LockboxMetaSchema,
});

export type LockboxSummary = z.infer<typeof LockboxSummarySchema>;
```

---

## Device cache models

```ts
/**
 * Local metadata for a remembered unlock.
 *
 * DeviceDB persists this beside a browser-generated non-extractable DeviceKey.
 * The DeviceKey is intentionally represented as an opaque browser handle,
 * rather than as serializable key bytes.
 */
export const DeviceVaultCacheSchema = z.object({
  format: z.literal("byok-device-cache-v1"),

  vaultLabel: VaultLabelSchema,
  vaultId: VaultIdSchema,

  /**
   * The VaultBundle epoch at the time this cache was created.
   *
   * A remote passphrase rotation advances the bundle epoch and invalidates
   * this remembered-unlock record on the next refresh or subscription update.
   */
  epoch: z.number().int().positive(),

  /**
   * The VaultKey encrypted under the local device key.
   */
  vaultKey: DeviceVaultKeyEnvelopeSchema,

  createdAt: IsoTimestampSchema,
  expiresAt: IsoTimestampSchema,
});

export type DeviceVaultCache = z.infer<typeof DeviceVaultCacheSchema>;
```

---

# Schema registry

The vault is generic over schemas for known lockboxes. This gives typed `store()` and `use()` calls.

```ts
export type VaultSchemaRegistry = Record<string, z.ZodTypeAny>;

export type KnownBoxLabel<R extends VaultSchemaRegistry> =
  Extract<keyof R, string>;

/**
 * Example application registry.
 *
 * The actual API-token shape is up to the application. Keeping the token
 * under a named field makes it less likely that generic JSON is accidentally
 * used where an API credential is expected.
 */
export const ExampleVaultSchemas = {
  "anthropic:personal": z.object({
    apiToken: z.string().min(1),
  }),

  "anthropic:work": z.object({
    apiToken: z.string().min(1),
  }),
} satisfies VaultSchemaRegistry;
```

A dynamic box can be supported by passing an explicit Zod schema to the relevant method. Static known boxes retain stronger TypeScript inference.

---

# Storage interfaces

## `VaultDB`

```ts
/**
 * Blind remote storage for encrypted vault records.
 *
 * A VaultDB adapter is expected to enforce account-level authorization:
 * the authenticated application user may access their own vault records,
 * while other authenticated users may not.
 *
 * The vault library performs cryptographic authorization separately:
 * possessing database access does not provide the ability to decrypt a vault.
 */
export interface VaultDB {
  /**
   * Fetch the vault bundle for a label.
   *
   * Returns null when the vault has not been initialized.
   */
  getVaultBundle(vaultLabel: VaultLabel): Promise<VaultBundle | null>;

  /**
   * Create or replace the bundle using epoch-based compare-and-swap.
   *
   * expectedEpoch:
   * - null: creation; succeeds only if no bundle exists
   * - number: update; succeeds only if the persisted epoch matches
   *
   * Implementations should report a VaultConflict-style error when the
   * compare-and-swap condition does not hold.
   */
  putVaultBundle(
    bundle: VaultBundle,
    expectedEpoch: number | null,
  ): Promise<void>;

  /**
   * Fetch one encrypted lockbox.
   */
  getLockbox(
    vaultLabel: VaultLabel,
    boxLabel: BoxLabel,
  ): Promise<LockboxRecord | null>;

  /**
   * Create or replace one encrypted lockbox using keyId compare-and-swap.
   *
   * expectedKeyId:
   * - null: creation; succeeds only if no lockbox exists
   * - keyId: replacement; succeeds only if the current record has that keyId
   */
  putLockbox(
    record: LockboxRecord,
    expectedKeyId: KeyId | null,
  ): Promise<void>;

  /**
   * Return public metadata needed to render a locked-vault UI.
   *
   * This intentionally excludes encrypted payload bytes.
   */
  listLockboxes(vaultLabel: VaultLabel): Promise<LockboxSummary[]>;

  /**
   * Delete a lockbox if it still has the expected revision.
   */
  deleteLockbox(
    vaultLabel: VaultLabel,
    boxLabel: BoxLabel,
    expectedKeyId: KeyId,
  ): Promise<void>;

  /**
   * Optional reactive integration, useful with Convex subscriptions.
   *
   * The callback should fire when the bundle changes. It need not provide the
   * full record; BYOKVault will re-fetch and validate it through getVaultBundle.
   */
  subscribeToVaultBundle?(
    vaultLabel: VaultLabel,
    onChange: () => void,
  ): () => void;

  /**
   * Optional reactive integration for lockbox-list changes.
   */
  subscribeToLockboxes?(
    vaultLabel: VaultLabel,
    onChange: () => void,
  ): () => void;
}
```

---

## `DeviceDB`

```ts
/**
 * Local device storage used for "remember this device for N days."
 *
 * A browser implementation commonly uses IndexedDB:
 * - a non-extractable AES-GCM CryptoKey is stored as the DeviceKey;
 * - DeviceVaultCache is stored beside it;
 * - the raw DeviceKey bytes are not exported into application storage.
 */
export interface DeviceDB {
  /**
   * Return the browser-local DeviceKey, if one exists.
   *
   * The key should be non-extractable and suitable for AES-GCM encryption.
   */
  getDeviceKey(vaultLabel: VaultLabel): Promise<CryptoKey | null>;

  /**
   * Return an existing DeviceKey or create one.
   *
   * This is called only when a caller asks to remember an unlocked vault.
   */
  ensureDeviceKey(vaultLabel: VaultLabel): Promise<CryptoKey>;

  /**
   * Read a remembered VaultKey cache.
   */
  getVaultCache(vaultLabel: VaultLabel): Promise<DeviceVaultCache | null>;

  /**
   * Persist a remembered VaultKey cache.
   */
  putVaultCache(cache: DeviceVaultCache): Promise<void>;

  /**
   * Remove the remembered cache while retaining the DeviceKey.
   *
   * This is useful for lock({ forgetDevice: false }) behavior.
   */
  clearVaultCache(vaultLabel: VaultLabel): Promise<void>;

  /**
   * Remove both the cache and the browser-local DeviceKey for this vault.
   *
   * This backs “forget this device” behavior.
   */
  clearVault(vaultLabel: VaultLabel): Promise<void>;

  /**
   * Remove local cache entries for all vaults, generally during sign-out.
   */
  clearAll(): Promise<void>;

  /**
   * Declares whether the adapter can retain non-extractable key handles.
   *
   * A browser IndexedDB implementation should report true.
   * A weaker mobile or testing adapter can report false so the application
   * can decide whether to disable remembered unlocks.
   */
  readonly capabilities: {
    nonExtractableDeviceKeys: boolean;
  };
}
```

---

# Crypto interface

```ts
/**
 * Opaque in-memory handles used by the vault.
 *
 * The concrete implementation may use WebCrypto CryptoKey values, transient
 * Uint8Array values, or a combination. The public vault interface does not
 * expose these handles to application code.
 */
export declare const PassphraseKeyBrand: unique symbol;
export declare const VaultKeyBrand: unique symbol;
export declare const DataKeyBrand: unique symbol;

export type PassphraseKeyHandle = {
  readonly [PassphraseKeyBrand]: true;
};

export type VaultKeyHandle = {
  readonly [VaultKeyBrand]: true;
};

export type DataKeyHandle = {
  readonly [DataKeyBrand]: true;
};

/**
 * Cryptographic operations required by BYOKVault.
 *
 * Browser implementation:
 * - Argon2id via hash-wasm in a Web Worker
 * - AES-GCM via WebCrypto
 * - random bytes via crypto.getRandomValues()
 */
export interface CryptoProvider {
  /**
   * Indicates whether this runtime can execute argon2id-web-v1.
   *
   * An environment with blocked WebAssembly can still display public vault
   * metadata, but passphrase-based initialization and unlock will fail with
   * CapabilityUnavailable.
   */
  readonly capabilities: {
    argon2idWebV1: boolean;
    workerBackedArgon2id: boolean;
    webCryptoAesGcm: boolean;
  };

  /**
   * Derive a passphrase KEK using the pinned Argon2id profile.
   *
   * signal may cancel an in-progress worker operation when the caller closes
   * an unlock screen or navigates away.
   */
  derivePassphraseKey(
    passphrase: string,
    salt: Uint8Array,
    profile: Argon2idWebV1,
    signal?: AbortSignal,
  ): Promise<PassphraseKeyHandle>;

  /**
   * Generate a fresh random 256-bit VaultKey.
   *
   * VaultKey is stable across normal passphrase rotation and is used to wrap
   * per-lockbox DEKs.
   */
  generateVaultKey(): Promise<VaultKeyHandle>;

  /**
   * Generate a fresh random 256-bit per-lockbox DEK.
   */
  generateDataKey(): Promise<DataKeyHandle>;

  /**
   * Produce cryptographically secure random bytes.
   */
  randomBytes(length: number): Uint8Array;

  /**
   * Encrypt arbitrary JSON bytes under a per-lockbox DataKey.
   */
  sealData(
    key: DataKeyHandle,
    plaintext: Uint8Array,
    aad: Uint8Array,
  ): Promise<AesGcmEnvelope>;

  /**
   * Decrypt JSON bytes under a per-lockbox DataKey.
   */
  openData(
    key: DataKeyHandle,
    envelope: AesGcmEnvelope,
    aad: Uint8Array,
  ): Promise<Uint8Array>;

  /**
   * Encrypt a lockbox DEK under the vault-level VaultKey.
   */
  wrapDataKey(
    vaultKey: VaultKeyHandle,
    dataKey: DataKeyHandle,
    aad: Uint8Array,
  ): Promise<WrappedDek>;

  /**
   * Recover a lockbox DEK from its VaultKey envelope.
   */
  unwrapDataKey(
    vaultKey: VaultKeyHandle,
    wrappedDataKey: WrappedDek,
    aad: Uint8Array,
  ): Promise<DataKeyHandle>;

  /**
   * Encrypt the VaultKey under the Argon2id-derived passphrase key.
   */
  wrapVaultKeyWithPassphrase(
    passphraseKey: PassphraseKeyHandle,
    vaultKey: VaultKeyHandle,
    aad: Uint8Array,
  ): Promise<PassphraseVaultKeyEnvelope>;

  /**
   * Recover the VaultKey from the passphrase envelope.
   *
   * An AES-GCM authentication failure maps to WrongPassphrase unless the
   * application has already established that the key is correct through a
   * separate trusted path.
   */
  unwrapVaultKeyWithPassphrase(
    passphraseKey: PassphraseKeyHandle,
    envelope: PassphraseVaultKeyEnvelope,
    aad: Uint8Array,
  ): Promise<VaultKeyHandle>;

  /**
   * Encrypt the VaultKey under a browser-local non-extractable DeviceKey.
   */
  wrapVaultKeyForDevice(
    deviceKey: CryptoKey,
    vaultKey: VaultKeyHandle,
    aad: Uint8Array,
  ): Promise<DeviceVaultKeyEnvelope>;

  /**
   * Recover a remembered VaultKey using a browser-local DeviceKey.
   */
  unwrapVaultKeyForDevice(
    deviceKey: CryptoKey,
    envelope: DeviceVaultKeyEnvelope,
    aad: Uint8Array,
  ): Promise<VaultKeyHandle>;
}
```

The provider can internally handle raw transient byte buffers where WebCrypto requires them. Those buffers are not part of the application-facing `BYOKVault` API.

---

# Vault state and errors

```ts
export type VaultUnlockOrigin =
  | "passphrase"
  | "device"
  | "recovery";

export type VaultStatus =
  | {
      state: "absent";
      vaultLabel: VaultLabel;
      canUsePinnedKdf: boolean;
    }
  | {
      state: "locked";
      vaultLabel: VaultLabel;
      vaultId: VaultId;
      epoch: number;
      canUsePinnedKdf: boolean;
      hasRecoveryKit: boolean;
    }
  | {
      state: "unlocked";
      vaultLabel: VaultLabel;
      vaultId: VaultId;
      epoch: number;
      origin: VaultUnlockOrigin;
      expiresAt?: string;
    }
  | {
      /**
       * A remote passphrase rotation or recovery reset advanced the epoch.
       *
       * The local in-memory and remembered-device keys should be discarded.
       */
      state: "stale";
      vaultLabel: VaultLabel;
      vaultId: VaultId;
      localEpoch: number;
      remoteEpoch: number;
    }
  | {
      state: "destroyed";
    };

export type VaultErrorCode =
  | "CapabilityUnavailable"
  | "Cancelled"
  | "DeviceCacheExpired"
  | "IntegrityFailure"
  | "LockboxAbsent"
  | "LockboxConflict"
  | "SchemaViolation"
  | "StaleVault"
  | "VaultAbsent"
  | "VaultAlreadyExists"
  | "VaultConflict"
  | "VaultLocked"
  | "WrongPassphrase";

export interface VaultError extends Error {
  readonly code: VaultErrorCode;
}
```

---

# `BYOKVault` interface

```ts
export interface BYOKVaultOptions<R extends VaultSchemaRegistry> {
  /**
   * Runtime schemas for known lockboxes.
   *
   * They validate values before encryption and after decryption.
   */
  schemas: R;

  /**
   * Default duration for a remembered-device unlock.
   *
   * This is applied only when unlock({ remember: true }) is requested.
   */
  defaultRememberDurationMs: number;

  /**
   * Optional browser behavior.
   *
   * "hidden" may lock in-memory state when the tab becomes hidden.
   * "idle" may lock after an application-managed idle timeout.
   * "never" leaves lifecycle decisions to the caller.
   */
  autoLockOn?: "hidden" | "idle" | "never";

  /**
   * Allows remembered unlock only when DeviceDB reports that it can retain
   * non-extractable browser key handles.
   *
   * The default application policy would usually be false.
   */
  allowExtractableDeviceCache?: boolean;
}

export interface StoreOptions {
  /**
   * Public metadata that remains available while the vault is locked.
   */
  meta: Omit<LockboxMeta, "createdAt" | "updatedAt">;

  /**
   * Application-defined JSON content version.
   */
  contentVersion?: number;
}

export interface UnlockOptions {
  /**
   * Persist a browser-local remembered unlock.
   */
  remember?: boolean;

  /**
   * Overrides defaultRememberDurationMs for this unlock.
   */
  rememberDurationMs?: number;

  /**
   * Cancels an ongoing Argon2id derivation where supported.
   */
  signal?: AbortSignal;
}

export interface RotationProgress {
  phase: "derive-old-passphrase" | "derive-new-passphrase" | "commit";
}

export interface RecoveryKit {
  /**
   * Display this to the user once. The vault implementation does not retain
   * the phrase after this method resolves.
   */
  phrase: string;

  /**
   * Identifies the recovery format presented to the user or stored in a
   * recovery-kit export flow. VaultBundle.recovery holds the actual envelope.
   */
  format: "bip39-argon2id-web-v1";
}

/**
 * Client-side encrypted vault for user-provided API tokens and other small
 * JSON secrets.
 *
 * BYOKVault is deliberately not a request proxy. Application code decrypts
 * the required token inside use() and makes the external API request directly
 * from the user’s device.
 */
export interface BYOKVault<R extends VaultSchemaRegistry> {
  /**
   * Return the current local vault state.
   *
   * This method does not perform network I/O or passphrase derivation.
   */
  status(): VaultStatus;

  /**
   * Initialize a previously absent vault.
   *
   * This creates:
   * - a random VaultKey;
   * - a random Argon2 salt;
   * - a passphrase envelope around the VaultKey;
   * - an epoch-1 VaultBundle.
   *
   * A concurrent initialization by another device produces VaultAlreadyExists
   * or VaultConflict, depending on the VaultDB adapter.
   */
  initialize(
    passphrase: string,
    options?: Pick<UnlockOptions, "remember" | "rememberDurationMs" | "signal">,
  ): Promise<{ epoch: number; expiresAt?: string }>;

  /**
   * Unlock an existing vault using its passphrase.
   *
   * The operation derives the pinned Argon2id key and decrypts the VaultKey.
   * If remember is selected, the VaultKey is additionally encrypted under a
   * device-local key and stored through DeviceDB.
   */
  unlock(
    passphrase: string,
    options?: UnlockOptions,
  ): Promise<{ epoch: number; expiresAt?: string }>;

  /**
   * Discard the in-memory VaultKey and any transient unwrapped DEKs.
   *
   * forgetDevice additionally removes the local remembered-unlock cache and
   * device key for this vault.
   */
  lock(options?: { forgetDevice?: boolean }): Promise<void>;

  /**
   * Fetch current vault metadata and reconcile local state.
   *
   * If the epoch is unchanged, newly-created lockboxes from other devices can
   * be read using the currently unlocked VaultKey.
   *
   * If the epoch changed, the instance enters "stale" state and drops local
   * remembered-unlock material. The caller can then unlock with the new
   * passphrase.
   */
  refresh(): Promise<VaultStatus>;

  /**
   * Return plaintext lockbox summaries. This is valid while locked.
   */
  list(): Promise<LockboxSummary[]>;

  /**
   * Validate and JSON-encode contents, then encrypt them into a lockbox.
   *
   * Each call creates a new per-lockbox DEK, data encryption envelope, and
   * keyId. If the box already exists, the write uses the current keyId as its
   * compare-and-swap token.
   */
  store<K extends KnownBoxLabel<R>>(
    boxLabel: K,
    contents: z.output<R[K]>,
    options: StoreOptions,
  ): Promise<{ keyId: KeyId }>;

  /**
   * Dynamic-box form of store().
   *
   * Use this where box labels are created at runtime rather than declared in
   * the static schema registry.
   */
  storeDynamic<T>(
    boxLabel: BoxLabel,
    contents: T,
    schema: z.ZodType<T>,
    options: StoreOptions,
  ): Promise<{ keyId: KeyId }>;

  /**
   * Decrypt one lockbox and make its parsed contents available only for the
   * duration of callback execution.
   *
   * This shape discourages retaining secrets in React state, global stores,
   * telemetry payloads, or error objects. The callback is still ordinary
   * JavaScript, so callers should avoid logging or retaining its input.
   */
  use<K extends KnownBoxLabel<R>, Result>(
    boxLabel: K,
    callback: (
      contents: z.output<R[K]>,
    ) => Result | Promise<Result>,
  ): Promise<Result>;

  /**
   * Dynamic-box form of use().
   */
  useDynamic<T, Result>(
    boxLabel: BoxLabel,
    schema: z.ZodType<T>,
    callback: (contents: T) => Result | Promise<Result>,
  ): Promise<Result>;

  /**
   * Delete a lockbox with optimistic concurrency protection.
   */
  remove(boxLabel: BoxLabel): Promise<void>;

  /**
   * Re-encrypt a lockbox under a fresh DEK without changing its JSON contents.
   *
   * This can be used when rotating the external credential itself or as part
   * of a maintenance operation.
   */
  rotateLockbox(boxLabel: BoxLabel): Promise<{ keyId: KeyId }>;

  /**
   * Change the vault passphrase.
   *
   * The VaultKey remains the same. The operation derives a new passphrase KEK
   * with a newly generated salt, re-encrypts the VaultKey, increments epoch,
   * and compare-and-swap writes the VaultBundle.
   *
   * Existing lockboxes do not need to be rewritten because their DEKs remain
   * wrapped by the unchanged VaultKey.
   */
  rotate(
    oldPassphrase: string,
    newPassphrase: string,
    options?: {
      signal?: AbortSignal;
      onProgress?: (progress: RotationProgress) => void;
    },
  ): Promise<{ epoch: number }>;

  /**
   * Create a mnemonic-based recovery route.
   *
   * The recovery mnemonic derives a separate key that encrypts the existing
   * VaultKey. It allows recovery from a forgotten passphrase without
   * re-encrypting lockboxes.
   *
   * The recovery path uses the same pinned Argon2id profile, so it requires an
   * environment capable of running argon2id-web-v1.
   */
  createRecoveryKit(
    passphrase: string,
    options?: { signal?: AbortSignal },
  ): Promise<RecoveryKit>;

  /**
   * Unlock with a recovery phrase.
   *
   * A successful recovery unlock is normally followed by rotate(), which
   * establishes a replacement passphrase and advances the vault epoch.
   */
  unlockWithRecovery(
    phrase: string,
    options?: Pick<UnlockOptions, "remember" | "rememberDurationMs" | "signal">,
  ): Promise<{ epoch: number; expiresAt?: string }>;

  /**
   * Remove the mnemonic-based recovery envelope from the VaultBundle.
   *
   * Passphrase verification is required before changing recovery settings.
   */
  revokeRecoveryKit(
    passphrase: string,
    options?: { signal?: AbortSignal },
  ): Promise<void>;

  /**
   * Subscribe to local state changes.
   *
   * If VaultDB provides reactive subscriptions, this includes remote epoch and
   * lockbox-list updates discovered through those subscriptions.
   */
  subscribe(listener: (status: VaultStatus) => void): () => void;

  /**
   * Release in-memory references, abort background work where possible, and
   * unsubscribe from VaultDB change notifications.
   */
  destroy(): Promise<void>;
}
```

---

# Factory interface

```ts
export interface BYOKVaultDependencies {
  vaultDB: VaultDB;
  deviceDB: DeviceDB;
  crypto: CryptoProvider;

  /**
   * Injected clock keeps expiration and state-transition tests deterministic.
   */
  clock?: {
    now(): Date;
  };
}

/**
 * Create a local vault handle for a given remote vault label.
 *
 * This operation:
 * - fetches and validates the VaultBundle, if present;
 * - checks whether a valid remembered-device cache exists;
 * - attempts silent device unlock when the cache epoch matches;
 * - does not prompt for a passphrase;
 * - does not initialize an absent vault automatically.
 *
 * The resulting status is usually absent, locked, or unlocked via device cache.
 */
export interface BYOKVaultFactory {
  findOrCreate<R extends VaultSchemaRegistry>(
    vaultLabel: VaultLabel,
    dependencies: BYOKVaultDependencies,
    options: BYOKVaultOptions<R>,
  ): Promise<BYOKVault<R>>;
}
```

---

## Typical lifecycle supported by this interface

| Situation | Resulting state / operation |
|---|---|
| New user, no vault bundle | `findOrCreate()` → `absent`; call `initialize(passphrase)` |
| Existing vault on a new device | `findOrCreate()` → `locked`; call `unlock(passphrase)` |
| Returning on remembered device before expiry | `findOrCreate()` → `unlocked`, origin `"device"` |
| Device cache expired or cleared | `locked`; call `unlock(passphrase)` |
| New lockbox created on another device | `refresh()` retains unlocked state if bundle epoch is unchanged |
| Passphrase rotated elsewhere | `refresh()` transitions to `stale`; call `unlock(newPassphrase)` |
| Browser cannot run Argon2id WASM | Locked metadata remains available; `initialize`, `unlock`, and recovery unlock report `CapabilityUnavailable` |
| User forgot passphrase with a recovery kit | `unlockWithRecovery(phrase)`, then establish a new passphrase with `rotate()` |
| User signs out | `lock({ forgetDevice: true })`, then optionally `deviceDB.clearAll()` |

This format keeps the remote database limited to salts, public metadata, encrypted VaultKey envelopes, encrypted DEKs, encrypted JSON content, and concurrency identifiers.
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

Below is an interface-oriented design for a client-side BYOK vault using one pinned keyDeriverSpec:

- **Key deriver:** `hash-wasm` Argon2id, run in a Web Worker
- **Encryption and key wrapping:** browser `crypto.subtle`, AES-256-GCM
- **Persistent device cache:** IndexedDB, e.g. through `idb-keyval`
- **Validation:** Zod
- **Optional recovery mnemonic:** `@scure/bip39`

The vault stores only encrypted records in `VaultDB`. The passphrase derives the passphraseKey, which unwraps a random vaultKey; that vaultKey wraps per-lockbox lockboxKeys.

This extra vaultKey layer is useful:

```text
passphrase
  │
  └─ Argon2id ──> passphraseKey
                     │
                     └─ AES-GCM unwrap ──> vaultKey
                                               │
                                               ├─ unwrap lockboxKey for "anthropic-prod"
                                               │      └─ decrypt whisper
                                               │
                                               └─ unwrap lockboxKey for "openai-dev"
                                                      └─ decrypt whisper
```

Changing the passphrase re-wraps the small `vaultKey`; it does not require rewriting every lockbox.

---

## Pinned keyDeriverSpec

```ts
import { z } from "zod";

/**
 * The sole keyDeriverSpec supported by this vault format.
 *
 * m: 64 MiB of Argon2 memory, expressed in KiB.
 * t: three Argon2 passes.
 * p: one lane, which is appropriate for a browser worker.
 *
 * The keyDeriverSpec is stored in vault records so that the stored format is
 * self-describing and can be recognized by future versions of the library.
 */
export const KeyDeriverSpecSchema = z.object({
  algorithm: z.literal("argon2id"),
  key_deriver_label: z.literal("argon2id_web_v1"),

  /** Argon2 memory cost, in KiB: 64 MiB. */
  memory_kib: z.literal(65_536),

  /** Argon2 iteration/time cost. */
  iterations: z.literal(3),

  /** Argon2 parallelism/lane count. */
  parallelism: z.literal(1),

  /** Random passphraseSalt size used for passphrase derivation. */
  salt_bytes: z.literal(16),

  /** Derived key material length. */
  output_bytes: z.literal(32),
});

export type KeyDeriverSpec = z.infer<typeof KeyDeriverSpecSchema>;

export const Argon2idWebV1: KeyDeriverSpec = {
  algorithm: "argon2id",
  key_deriver_label: "argon2id_web_v1",
  memory_kib: 65_536,
  iterations: 3,
  parallelism: 1,
  salt_bytes: 16,
  output_bytes: 32,
};
```

There is no caller-selected key deriver algorithm or parameter set. A device which cannot run the keyDeriverSpec, such as one where WebAssembly is blocked, can inspect public metadata but cannot perform a passphrase unlock.

---

# Zod models

## Shared primitives

```ts
/**
 * Binary values held by the vault format.
 *
 * A VaultDB adapter may serialize this as Convex `v.bytes()`, ArrayBuffer,
 * base64url, or another transport representation. The vault-facing adapter
 * should return Uint8Array values after deserialization.
 */
export const BytesSchema = z.instanceof(Uint8Array);

/** A 96-bit AES-GCM cipherIv. */
export const CipherIvSchema = BytesSchema.refine(
  (bytes) => bytes.byteLength === 12,
  "cipherIv must contain exactly 12 bytes",
);

/** A 256-bit symmetric-key value when represented transiently as bytes. */
export const KeyBytesSchema = BytesSchema.refine(
  (bytes) => bytes.byteLength === 32,
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
 * Unlike VaultLabel, this is immutable. It is used in cipherAdditionalData
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
 * A new revisionId is generated when store() replaces a lockbox or when
 * rotateLockbox() is called. It also acts as the optimistic-concurrency token.
 */
export const RevisionIdSchema = z
  .string()
  .min(16)
  .max(128)
  .brand<"RevisionId">();

export type RevisionId = z.infer<typeof RevisionIdSchema>;

export const IsoTimestampSchema = z.string().datetime({ offset: true });
```

---

## AES-GCM envelope models

```ts
/**
 * AES-GCM encrypted bytes.
 *
 * The authentication tag is included in ciphertext, as returned by WebCrypto.
 * The cipherAdditionalData is reconstructed from the record context and is not stored here.
 */
export const AesGcmEnvelopeSchema = z.object({
  cipher_iv: CipherIvSchema,
  ciphertext: BytesSchema,
});

export type AesGcmEnvelope = z.infer<typeof AesGcmEnvelopeSchema>;

/**
 * The passphraseKey encrypts the random vaultKey.
 *
 * Decrypting this envelope successfully proves that the supplied passphrase
 * derived the correct passphraseKey. A separate passphrase-verifier field is therefore
 * not required.
 */
export const VaultKeyPassphraseWrappedSchema = AesGcmEnvelopeSchema;

export type VaultKeyPassphraseWrapped = z.infer<
  typeof VaultKeyPassphraseWrappedSchema
>;

/**
 * Each lockbox has its own random 256-bit lockboxKey. The vaultKey encrypts that lockboxKey.
 */
export const LockboxKeyWrappedSchema = AesGcmEnvelopeSchema;

export type LockboxKeyWrapped = z.infer<typeof LockboxKeyWrappedSchema>;

/**
 * A remembered device stores the vaultKey encrypted under a browser-generated,
 * non-extractable localUnlockKey held in IndexedDB.
 */
export const VaultKeyLocalWrappedSchema = AesGcmEnvelopeSchema;

export type VaultKeyLocalWrapped = z.infer<
  typeof VaultKeyLocalWrappedSchema
>;
```

---

## Vault bundle

```ts
/**
 * Public and encrypted metadata required to unlock one vault.
 *
 * This record belongs in VaultDB. It does not contain the passphrase,
 * vaultKey, a lockboxKey, or an unciphered whisper.
 */
export const VaultBundleSchema = z.object({
  format: z.literal("byok-vault-v1"),

  vaultlabel: VaultLabelSchema,
  vaultId: VaultIdSchema,

  /**
   * Increments when the passphrase envelope changes:
   * - passphrase change
   * - passphraseKey re-derivation
   * - recovery-based passphrase reset
   *
   * Device caches record the passphraseEpoch they were created against. A mismatch
   * prompts the client to discard its remembered-unlock cache.
   */
  passphrase_epoch: z.number().int().positive(),

  /**
   * The fixed, pinned Argon2id keyDeriverSpec for this vault format.
   */
  key_deriver_spec: KeyDeriverSpecSchema,

  /**
   * Random passphraseSalt for the current passphrase.
   */
  passphrase_salt: BytesSchema.refine(
    (bytes) => bytes.byteLength === Argon2idWebV1.salt_bytes,
    "Unexpected passphraseSalt length",
  ),

  /**
   * Random vaultKey encrypted under:
   * Argon2id(passphrase, passphraseSalt, Argon2idWebV1).
   */
  vault_key_passphrase_wrapped: VaultKeyPassphraseWrappedSchema,

  /**
   * Optional recovery route. It encrypts the same vaultKey as
   * vault_key_passphrase_wrapped, under a key derived from a recovery mnemonic.
   *
   * The phrase itself is not stored in VaultDB.
   */
  recovery: z
    .object({
      format: z.literal("bip39_argon2id_web_v1"),
      salt: BytesSchema.refine(
        (bytes) => bytes.byteLength === Argon2idWebV1.salt_bytes,
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

  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema,
});

export type LockboxMeta = z.infer<typeof LockboxMetaSchema>;

/**
 * An encrypted whisper plus the per-record lockboxKey envelope.
 *
 * One fresh lockboxKey is generated for each store() operation. Replacing the
 * whisper creates a new revisionId, a new lockboxKey, a new lockbox_key_wrapped, and a new whisper cipherIv.
 */
export const LockboxRecordSchema = z.object({
  format: z.literal("byok-lockbox-v1"),

  vaultlabel: VaultLabelSchema,
  vaultId: VaultIdSchema,
  boxlabel: BoxLabelSchema,

  /**
   * Current revision and compare-and-swap token.
   */
  revision_id: RevisionIdSchema,

  /**
   * Random record lockboxKey encrypted under the vault's vaultKey.
   */
  lockbox_key_wrapped: LockboxKeyWrappedSchema,

  /**
   * JSON-encoded whisper encrypted under this record's lockboxKey.
   */
  whisper_ciphered: AesGcmEnvelopeSchema,

  /**
   * Application-controlled format version for the decrypted whisper.
   *
   * This can be useful if the schema for a given box evolves over time.
   */
  whisper_schema_version: z.number().int().positive().default(1),

  meta: LockboxMetaSchema,
});

export type LockboxRecord = z.infer<typeof LockboxRecordSchema>;

/**
 * The non-secret subset returned by listLockboxes().
 */
export const LockboxSummarySchema = z.object({
  boxlabel: BoxLabelSchema,
  revision_id: RevisionIdSchema,
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
 * DeviceDB persists this beside a browser-generated non-extractable localUnlockKey.
 * The localUnlockKey is intentionally represented as an opaque browser handle,
 * rather than as serializable key bytes.
 */
export const DeviceVaultCacheSchema = z.object({
  format: z.literal("byok-device-cache-v1"),

  vaultlabel: VaultLabelSchema,
  vaultId: VaultIdSchema,

  /**
   * The VaultBundle passphraseEpoch at the time this cache was created.
   *
   * A remote passphrase change advances the bundle passphraseEpoch and invalidates
   * this remembered-unlock record on the next refresh or subscription update.
   */
  passphrase_epoch: z.number().int().positive(),

  /**
   * The vaultKey encrypted under the localUnlockKey.
   */
  vault_key_local_wrapped: VaultKeyLocalWrappedSchema,

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
 * The actual API-key shape is up to the application. Keeping the API key
 * under a named field makes it less likely that generic JSON is accidentally
 * used where an API credential is expected.
 */
export const ExampleVaultSchemas = {
  "anthropic:personal": z.object({
    apiKey: z.string().min(1),
  }),

  "anthropic:work": z.object({
    apiKey: z.string().min(1),
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
  getVaultBundle(vaultlabel: VaultLabel): Promise<VaultBundle | null>;

  /**
   * Create or replace the bundle using passphraseEpoch-based compare-and-swap.
   *
   * expectedPassphraseEpoch:
   * - null: creation; succeeds only if no bundle exists
   * - number: update; succeeds only if the persisted passphraseEpoch matches
   *
   * Implementations should report a VaultConflict-style error when the
   * compare-and-swap condition does not hold.
   */
  putVaultBundle(
    bundle: VaultBundle,
    expectedPassphraseEpoch: number | null,
  ): Promise<void>;

  /**
   * Fetch one encrypted lockbox.
   */
  getLockbox(
    vaultlabel: VaultLabel,
    boxlabel: BoxLabel,
  ): Promise<LockboxRecord | null>;

  /**
   * Create or replace one encrypted lockbox using revisionId compare-and-swap.
   *
   * expectedRevisionId:
   * - null: creation; succeeds only if no lockbox exists
   * - revisionId: replacement; succeeds only if the current record has that revisionId
   */
  putLockbox(
    record: LockboxRecord,
    expectedRevisionId: RevisionId | null,
  ): Promise<void>;

  /**
   * Return public metadata needed to render a locked-vault UI.
   *
   * This intentionally excludes each whisperCiphered.
   */
  listLockboxes(vaultlabel: VaultLabel): Promise<LockboxSummary[]>;

  /**
   * Delete a lockbox if it still has the expected revision.
   */
  deleteLockbox(
    vaultlabel: VaultLabel,
    boxlabel: BoxLabel,
    expectedRevisionId: RevisionId,
  ): Promise<void>;

  /**
   * Optional reactive integration, useful with Convex subscriptions.
   *
   * The callback should fire when the bundle changes. It need not provide the
   * full record; BYOKVault will re-fetch and validate it through getVaultBundle.
   */
  subscribeToVaultBundle?(
    vaultlabel: VaultLabel,
    onChange: () => void,
  ): () => void;

  /**
   * Optional reactive integration for lockbox-list changes.
   */
  subscribeToLockboxes?(
    vaultlabel: VaultLabel,
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
 * - a non-extractable AES-GCM CryptoKey is stored as the localUnlockKey;
 * - DeviceVaultCache is stored beside it;
 * - the raw localUnlockKey bytes are not exported into application storage.
 */
export interface DeviceDB {
  /**
   * Return the browser-local localUnlockKey, if one exists.
   *
   * The localUnlockKey should be non-extractable and suitable for AES-GCM encryption.
   */
  getLocalUnlockKey(vaultlabel: VaultLabel): Promise<CryptoKey | null>;

  /**
   * Return an existing localUnlockKey or create one.
   *
   * This is called only when a caller asks to remember an unlocked vault.
   */
  ensureLocalUnlockKey(vaultlabel: VaultLabel): Promise<CryptoKey>;

  /**
   * Read a remembered vaultKey cache.
   */
  getVaultCache(vaultlabel: VaultLabel): Promise<DeviceVaultCache | null>;

  /**
   * Persist a remembered vaultKey cache.
   */
  putVaultCache(cache: DeviceVaultCache): Promise<void>;

  /**
   * Remove the remembered cache while retaining the localUnlockKey.
   *
   * This is useful for lock({ forgetDevice: false }) behavior.
   */
  clearVaultCache(vaultlabel: VaultLabel): Promise<void>;

  /**
   * Remove both the cache and the browser-local localUnlockKey for this vault.
   *
   * This backs “forget this device” behavior.
   */
  clearVault(vaultlabel: VaultLabel): Promise<void>;

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
    nonExtractableLocalUnlockKeys: boolean;
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
export declare const LockboxKeyBrand: unique symbol;

export type PassphraseKeyHandle = {
  readonly [PassphraseKeyBrand]: true;
};

export type VaultKeyHandle = {
  readonly [VaultKeyBrand]: true;
};

export type LockboxKeyHandle = {
  readonly [LockboxKeyBrand]: true;
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
   * Indicates whether this runtime can execute argon2id_web_v1.
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
   * Derive the passphraseKey using the pinned keyDeriverSpec.
   *
   * signal may cancel an in-progress worker operation when the caller closes
   * an unlock screen or navigates away.
   */
  derivePassphraseKey(
    passphrase: string,
    passphraseSalt: Uint8Array,
    keyDeriverSpec: KeyDeriverSpec,
    signal?: AbortSignal,
  ): Promise<PassphraseKeyHandle>;

  /**
   * Generate a fresh random 256-bit vaultKey.
   *
   * vaultKey is stable across normal passphrase change and is used to wrap
   * per-lockbox lockboxKeys.
   */
  generateVaultKey(): Promise<VaultKeyHandle>;

  /**
   * Generate a fresh random 256-bit per-lockbox lockboxKey.
   */
  generateLockboxKey(): Promise<LockboxKeyHandle>;

  /**
   * Produce cryptographically secure random bytes.
   */
  randomBytes(length: number): Uint8Array;

  /**
   * Cipher whisper bytes under a per-lockbox lockboxKey.
   */
  cipherWhisper(
    lockboxKey: LockboxKeyHandle,
    whisperBytes: Uint8Array,
    cipherAdditionalData: Uint8Array,
  ): Promise<AesGcmEnvelope>;

  /**
   * Decipher whisper bytes under a per-lockbox lockboxKey.
   */
  decipherWhisper(
    lockboxKey: LockboxKeyHandle,
    envelope: AesGcmEnvelope,
    cipherAdditionalData: Uint8Array,
  ): Promise<Uint8Array>;

  /**
   * Encrypt a lockboxKey under the vaultKey.
   */
  wrapLockboxKey(
    vaultKey: VaultKeyHandle,
    lockboxKey: LockboxKeyHandle,
    cipherAdditionalData: Uint8Array,
  ): Promise<LockboxKeyWrapped>;

  /**
   * Recover a lockboxKey from its vaultKey envelope.
   */
  unwrapLockboxKey(
    vaultKey: VaultKeyHandle,
    lockboxKeyWrapped: LockboxKeyWrapped,
    cipherAdditionalData: Uint8Array,
  ): Promise<LockboxKeyHandle>;

  /**
   * Encrypt the vaultKey under the passphraseKey.
   */
  wrapVaultKeyWithPassphrase(
    passphraseKey: PassphraseKeyHandle,
    vaultKey: VaultKeyHandle,
    cipherAdditionalData: Uint8Array,
  ): Promise<VaultKeyPassphraseWrapped>;

  /**
   * Recover the vaultKey from the passphrase envelope.
   *
   * An AES-GCM authentication failure maps to WrongPassphrase unless the
   * application has already established that the passphraseKey is correct through a
   * separate trusted path.
   */
  unwrapVaultKeyWithPassphrase(
    passphraseKey: PassphraseKeyHandle,
    envelope: VaultKeyPassphraseWrapped,
    cipherAdditionalData: Uint8Array,
  ): Promise<VaultKeyHandle>;

  /**
   * Encrypt the vaultKey under a browser-local non-extractable localUnlockKey.
   */
  wrapVaultKeyLocally(
    localUnlockKey: CryptoKey,
    vaultKey: VaultKeyHandle,
    cipherAdditionalData: Uint8Array,
  ): Promise<VaultKeyLocalWrapped>;

  /**
   * Recover a remembered vaultKey using a browser-local localUnlockKey.
   */
  unwrapVaultKeyLocally(
    localUnlockKey: CryptoKey,
    envelope: VaultKeyLocalWrapped,
    cipherAdditionalData: Uint8Array,
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
      vaultlabel: VaultLabel;
      canUseKeyDeriverSpec: boolean;
    }
  | {
      state: "locked";
      vaultlabel: VaultLabel;
      vaultId: VaultId;
      passphraseEpoch: number;
      canUseKeyDeriverSpec: boolean;
      hasRecoveryKit: boolean;
    }
  | {
      state: "unlocked";
      vaultlabel: VaultLabel;
      vaultId: VaultId;
      passphraseEpoch: number;
      origin: VaultUnlockOrigin;
      expiresAt?: string;
    }
  | {
      /**
       * A remote passphrase change or recovery reset advanced the passphraseEpoch.
       *
       * The local in-memory vaultKey and remembered-unlock material should be discarded.
       */
      state: "stale";
      vaultlabel: VaultLabel;
      vaultId: VaultId;
      localPassphraseEpoch: number;
      remotePassphraseEpoch: number;
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
   * Application-defined whisper schema version.
   */
  whisperSchemaVersion?: number;
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

export interface PassphraseChangeProgress {
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
  format: "bip39_argon2id_web_v1";
}

/**
 * Client-side encrypted vault for user-provided API keys and other small
 * JSON secrets.
 *
 * BYOKVault is deliberately not a request proxy. Application code decrypts
 * the required API key inside use() and makes the external API request directly
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
   * - a random vaultKey;
   * - a random passphraseSalt;
   * - a passphrase envelope around the vaultKey;
   * - a VaultBundle with passphraseEpoch 1.
   *
   * A concurrent initialization by another device produces VaultAlreadyExists
   * or VaultConflict, depending on the VaultDB adapter.
   */
  initialize(
    passphrase: string,
    options?: Pick<UnlockOptions, "remember" | "rememberDurationMs" | "signal">,
  ): Promise<{ passphraseEpoch: number; expiresAt?: string }>;

  /**
   * Unlock an existing vault using its passphrase.
   *
   * The operation derives the passphraseKey with the pinned keyDeriverSpec and decrypts the vaultKey.
   * If remember is selected, the vaultKey is additionally encrypted under a
   * localUnlockKey and stored through DeviceDB.
   */
  unlock(
    passphrase: string,
    options?: UnlockOptions,
  ): Promise<{ passphraseEpoch: number; expiresAt?: string }>;

  /**
   * Discard the in-memory vaultKey and any transient unwrapped lockboxKeys.
   *
   * forgetDevice additionally removes the local remembered-unlock cache and
   * localUnlockKey for this vault.
   */
  lock(options?: { forgetDevice?: boolean }): Promise<void>;

  /**
   * Fetch current vault metadata and reconcile local state.
   *
   * If the passphraseEpoch is unchanged, newly-created lockboxes from other devices can
   * be read using the currently unlocked vaultKey.
   *
   * If the passphraseEpoch changed, the instance enters "stale" state and drops local
   * remembered-unlock material. The caller can then unlock with the new
   * passphrase.
   */
  refresh(): Promise<VaultStatus>;

  /**
   * Return plaintext lockbox summaries. This is valid while locked.
   */
  list(): Promise<LockboxSummary[]>;

  /**
   * Validate and JSON-encode a whisper, then encrypt it into a lockbox.
   *
   * Each call creates a new per-lockbox lockboxKey, whisper envelope, and
   * revisionId. If the box already exists, the write uses the current revisionId as its
   * compare-and-swap token.
   */
  store<K extends KnownBoxLabel<R>>(
    boxlabel: K,
    whisper: z.output<R[K]>,
    options: StoreOptions,
  ): Promise<{ revisionId: RevisionId }>;

  /**
   * Dynamic-box form of store().
   *
   * Use this where box labels are created at runtime rather than declared in
   * the static schema registry.
   */
  storeDynamic<T>(
    boxlabel: BoxLabel,
    whisper: T,
    schema: z.ZodType<T>,
    options: StoreOptions,
  ): Promise<{ revisionId: RevisionId }>;

  /**
   * Decrypt one lockbox and make its parsed whisper available only for the
   * duration of callback execution.
   *
   * This shape discourages retaining secrets in React state, global stores,
   * telemetry payloads, or error objects. The callback is still ordinary
   * JavaScript, so callers should avoid logging or retaining its input.
   */
  use<K extends KnownBoxLabel<R>, Result>(
    boxlabel: K,
    callback: (
      whisper: z.output<R[K]>,
    ) => Result | Promise<Result>,
  ): Promise<Result>;

  /**
   * Dynamic-box form of use().
   */
  useDynamic<T, Result>(
    boxlabel: BoxLabel,
    schema: z.ZodType<T>,
    callback: (whisper: T) => Result | Promise<Result>,
  ): Promise<Result>;

  /**
   * Delete a lockbox with optimistic concurrency protection.
   */
  remove(boxlabel: BoxLabel): Promise<void>;

  /**
   * Re-encrypt a lockbox under a fresh lockboxKey without changing its whisper.
   *
   * This can be used when rotating the external credential itself or as part
   * of a maintenance operation.
   */
  rotateLockbox(boxlabel: BoxLabel): Promise<{ revisionId: RevisionId }>;

  /**
   * Change the vault passphrase.
   *
   * The vaultKey remains the same. The operation derives a new passphraseKey
   * with a newly generated passphraseSalt, re-encrypts the vaultKey, increments passphraseEpoch,
   * and compare-and-swap writes the VaultBundle.
   *
   * Existing lockboxes do not need to be rewritten because their lockboxKeys remain
   * wrapped by the unchanged vaultKey.
   */
  changePassphrase(
    oldPassphrase: string,
    newPassphrase: string,
    options?: {
      signal?: AbortSignal;
      onProgress?: (progress: PassphraseChangeProgress) => void;
    },
  ): Promise<{ passphraseEpoch: number }>;

  /**
   * Create a mnemonic-based recovery route.
   *
   * The recovery mnemonic derives a separate key that encrypts the existing
   * vaultKey. It allows recovery from a forgotten passphrase without
   * re-encrypting lockboxes.
   *
   * The recovery path uses the same pinned keyDeriverSpec, so it requires an
   * environment capable of running argon2id_web_v1.
   */
  createRecoveryKit(
    passphrase: string,
    options?: { signal?: AbortSignal },
  ): Promise<RecoveryKit>;

  /**
   * Unlock with a recovery phrase.
   *
   * A successful recovery unlock is normally followed by changePassphrase(), which
   * establishes a replacement passphrase and advances the passphraseEpoch.
   */
  unlockWithRecovery(
    phrase: string,
    options?: Pick<UnlockOptions, "remember" | "rememberDurationMs" | "signal">,
  ): Promise<{ passphraseEpoch: number; expiresAt?: string }>;

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
   * If VaultDB provides reactive subscriptions, this includes remote passphraseEpoch and
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
 * - attempts silent device unlock when the cache passphraseEpoch matches;
 * - does not prompt for a passphrase;
 * - does not initialize an absent vault automatically.
 *
 * The resulting status is usually absent, locked, or unlocked via device cache.
 */
export interface BYOKVaultFactory {
  findOrCreate<R extends VaultSchemaRegistry>(
    vaultlabel: VaultLabel,
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
| New lockbox created on another device | `refresh()` retains unlocked state if bundle passphraseEpoch is unchanged |
| Passphrase changed elsewhere | `refresh()` transitions to `stale`; call `unlock(newPassphrase)` |
| Browser cannot run Argon2id WASM | Locked metadata remains available; `initialize`, `unlock`, and recovery unlock report `CapabilityUnavailable` |
| User forgot passphrase with a recovery kit | `unlockWithRecovery(phrase)`, then establish a new passphrase with `changePassphrase()` |
| User signs out | `lock({ forgetDevice: true })`, then optionally `deviceDB.clearAll()` |

This format keeps the remote database limited to passphraseSalts, public metadata, encrypted vaultKey envelopes, encrypted lockboxKeys, ciphered whispers, and concurrency identifiers.
import { describe, expect, it } from 'vitest'
import * as Byok from '../src/index'

describe("the package's entry point", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(Byok)).to.have.members([
      'Argon2idWebV1', 'argon2idWebV1Deriver',
      'openVault',
      'Ciphered', 'Label', 'Lockbox', 'LockboxSummary', 'SevenDaysMs', 'Whisper', 'wallClock',
      'VaultError', 'VaultErrorKindVals', 'isVaultError',
      'VaultDB', 'localVaultDB', 'memoryDeviceDB',
      'domStore', 'memoryStore',
      'stableJsonify',
    ])
  })
})

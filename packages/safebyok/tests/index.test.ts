import { fileURLToPath } from 'node:url'
import { Rolldown } from 'tsdown'
import { describe, expect, it } from 'vitest'
import * as safebyok from '../src/index'

describe("the package's entry point", () => {
  it("exports exactly the public surface", () => {
    expect(Object.keys(safebyok)).to.have.members([
      'Argon2idWebV1', 'argon2idWebV1Deriver',
      'openVault',
      'Ciphered', 'EpochMillis', 'FarFuture', 'FarPast', 'ForcePassphraseReentryHours', 'Label', 'Lockbox', 'LockboxSummary', 'MaxLockboxes', 'MaxWhisperBytes', 'VaultBundle', 'VaultScope', 'Whisper', 'wallClock',
      'VaultError', 'VaultErrorKindVals', 'isVaultError',
      'VaultDB', 'localVaultDB', 'memoryDeviceDB',
      'domStore', 'memoryStore',
      'stableJsonify',
    ])
  })
})

const entrySource = fileURLToPath(new URL('../src/index.ts', import.meta.url))

/** The minified JavaScript a bundler ships for an app whose only import from safebyok is `imports`. */
const bundleOf = async (imports: string): Promise<string> => {
  const appModule = `export { ${imports} } from ${JSON.stringify(entrySource)}`
  const built = await Rolldown.build({
    input:    'app',
    platform: 'browser',
    write:    false,
    logLevel: 'silent',
    output:   { minify: true },
    plugins:  [{
      name:      'app_module',
      resolveId: (specifier) => (specifier === 'app' ? specifier : null),
      load:      (moduleId) => (moduleId === 'app' ? appModule : null),
    }],
  })
  return built.output.map((piece) => (piece.type === 'chunk' ? piece.code : '')).join('\n')
}

describe("the main entry's tree-shaking", () => {
  it("leaves Argon2id out of an app that imports openVault alone", async () => {
    const shipped = await bundleOf('openVault')
    expect(shipped).to.include('openVault')
    expect(shipped).to.not.match(/argon2/iu)
  }, 30_000)

  it("brings Argon2id in for an app that imports the deriver: the check above can fail", async () => {
    expect(await bundleOf('argon2idWebV1Deriver')).to.match(/argon2/iu)
  }, 30_000)
})

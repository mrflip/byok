import { describe, expect, it } from 'vitest'
import { VaultError } from '../src/errors'
import { parseDbName, parseInspectorOpts, type IdbOpts, type IdbShelf } from '../src/idb-opts'

const DbNameCases = [
  // regular usage:
  [undefined,                 "safebyok",  'no options at all reads as the default'],
  [{},                        "safebyok",  'a bag without a dbName reads as the default'],
  [{ dbName: undefined },     "safebyok",  'an undefined dbName reads as the default'],
  [{ dbName: "acme" },        "acme",      'a plain name is kept'],
  [{ dbName: "my-app db" },   "my-app db", 'any non-empty text is a name IndexedDB takes'],
] as const

describe("parseDbName", () => {
  for (const [opts, expected, blurb] of DbNameCases) {
    it(blurb, () => { expect(parseDbName(opts, 'idbVaultDB')).to.eq(expected) })
  }

  it("refuses an empty or non-text dbName, naming the call, never the input", () => {
    for (const dbName of ['', 42, ['acme']]) {
      expect(() => parseDbName({ dbName } as unknown as IdbOpts, 'browserOpts'))
        .to.throw(VaultError, /^browserOpts takes an optional dbName/).with.property('kind', 'bad_option')
    }
  })
})

describe("parseInspectorOpts", () => {
  it("keeps the shelf, and the dbName or its default", () => {
    expect(parseInspectorOpts({ shelf: 'device_db' })).to.deep.equal({ dbName: 'safebyok', shelf: 'device_db' })
    expect(parseInspectorOpts({ dbName: 'acme', shelf: 'vault_db' })).to.deep.equal({ dbName: 'acme', shelf: 'vault_db' })
  })

  it("refuses a missing or unknown shelf with kind 'bad_option'", () => {
    for (const shelf of [undefined, 'vault_rows', 'VAULT_DB']) {
      expect(() => parseInspectorOpts({ shelf } as unknown as { shelf: IdbShelf }))
        .to.throw(VaultError, /shelf/).with.property('kind', 'bad_option')
    }
  })
})

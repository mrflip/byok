import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { VaultError, VaultErrorKindVals, isVaultError } from '../src/errors'

const readmeText = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
const errorsSource = readFileSync(new URL('../src/errors.ts', import.meta.url), 'utf8')

/** The text from `from` up to the next `until`, or to the end. */
const between = (text: string, from: string, until: string): string => {
  const start = text.indexOf(from)
  const end = text.indexOf(until, start)
  return text.slice(start, end === -1 ? text.length : end)
}

/** The kinds in the backticked first cell of each table row of `text`. */
const tableKinds = (text: string): string[] => (
  Array.from(text.matchAll(/^\| `([a-z_]+)`/gm), (hit) => hit[1]!)
)

/** The kinds a doc block names, in backticks. */
const namedKinds = (text: string): string[] => (
  VaultErrorKindVals.filter((kind) => text.includes(`\`${kind}\``))
)

const MisuseKinds    = tableKinds(between(readmeText, '### Misuse', '### Conditions'))
const ConditionKinds = tableKinds(between(readmeText, '### Conditions', '\n## '))

describe("VaultErrorKindVals", () => {
  it("lists each kind once", () => {
    expect(new Set(VaultErrorKindVals).size).to.eq(VaultErrorKindVals.length)
  })

  it("is documented in the README, each kind in exactly one family's table", () => {
    expect([...MisuseKinds, ...ConditionKinds]).to.have.members([...VaultErrorKindVals])
    expect(MisuseKinds.filter((kind) => ConditionKinds.includes(kind))).to.deep.equal([])
  })

  it("puts the same kinds in each family as the doc block in errors.ts does", () => {
    expect(namedKinds(between(errorsSource, '- **Misuse**', '- **Condition**'))).to.have.members(MisuseKinds)
    expect(namedKinds(between(errorsSource, '- **Condition**', '`vault_full` means'))).to.have.members(ConditionKinds)
  })
})

describe("VaultError", () => {
  it("carries its kind, and isVaultError tells it apart", () => {
    const err = new VaultError('vault_full', 'This vault is full.')
    expect(err.kind).to.eq('vault_full')
    expect(isVaultError(err)).to.be.true
    expect(isVaultError(err, 'vault_full')).to.be.true
    expect(isVaultError(err, 'stale_write')).to.be.false
    expect(isVaultError(new Error('vault_full'))).to.be.false
  })
})

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import * as TH from './test-helpers'
import { BundleColumns, LockboxColumns } from '../src/columns'
import { VaultChangeChannel, VaultTablesSql } from '../src/vault-tables'

/** A column as information_schema describes it: its name and its type. */
type DescribedColumn = { column_name: string, data_type: string }

const TypeForKind = { text: 'text', bigint: 'bigint', jsonb: 'jsonb' } as const

const describedColumns = async (db: PGlite, table: string) => {
  const { rows } = await db.query<DescribedColumn>(
    'SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position',
    [table],
  )
  return rows.map((row) => [row.column_name, row.data_type])
}

TH.bootDatabaseFirst()

describe("VaultTablesSql", () => {
  it("is the package's vault-tables.sql, word for word", () => {
    const shipped = readFileSync(path.join(import.meta.dirname, '..', 'vault-tables.sql'), 'utf8')
    expect(VaultTablesSql).to.eq(shipped)
  })

  it("can be run again over the tables it made, keeping their rows", async () => {
    const db = await TH.emptyDatabase()
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await db.exec(VaultTablesSql)
    expect(await TH.requestFor(db, 'u1').readBundle(TH.scopeOf('u1'))).to.deep.equal(TH.bundleOf('u1'))
  })

  it("makes a bundle's columns exactly as the adapter writes them, in order, then the vault's lockbox count", async () => {
    const db = await TH.database()
    expect(await describedColumns(db, 'safebyok_bundles')).to.deep.equal([
      ...BundleColumns.map(([field, kind]) => [field, TypeForKind[kind]]),
      ['lockbox_count', 'bigint'],
    ])
  })

  it("makes a lockbox's columns exactly as the adapter writes them, after its vault's scope and vault_id", async () => {
    const db = await TH.database()
    const adapterColumns = [['applabel', 'text'], ['user_id', 'text'], ['vaultlabel', 'text'], ['vault_id', 'text']]
    expect(await describedColumns(db, 'safebyok_lockboxes')).to.deep.equal([
      ...adapterColumns,
      ...LockboxColumns.map(([field, kind]) => [field, TypeForKind[kind]]),
    ])
  })

  it("sets a count gone astray right with the recount its comments and the README give", async () => {
    const recount = "UPDATE safebyok_bundles AS bundle SET lockbox_count = (SELECT count(*) FROM safebyok_lockboxes AS box WHERE (box.applabel, box.user_id, box.vaultlabel, box.vault_id) = (bundle.applabel, bundle.user_id, bundle.vaultlabel, bundle.vault_id));"
    const readme = readFileSync(path.join(import.meta.dirname, '..', 'README.md'), 'utf8')
    expect(VaultTablesSql).to.include(recount)
    expect(readme).to.include(recount)
    const db = await TH.emptyDatabase()
    const vaultDB = TH.requestFor(db, 'u1')
    await vaultDB.createBundle(TH.bundleOf('u1'))
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('openai', 'sk-fake'), { vault_id: 'vault-id-u1', revision_id: null })
    await db.exec('TRUNCATE safebyok_lockboxes')
    await vaultDB.updateBox(TH.scopeOf('u1'), TH.boxOf('anthropic', 'sk-fake'), { vault_id: 'vault-id-u1', revision_id: null })
    await db.exec(recount)
    const { rows } = await db.query('SELECT lockbox_count FROM safebyok_bundles')
    expect(rows).to.deep.equal([{ lockbox_count: 1 }])
  })

  it("notifies the channel the adapter listens on", () => {
    expect(VaultTablesSql).to.include(`pg_notify('${VaultChangeChannel}'`)
  })

  it("keeps every row from a role that is not the tables' owner", async () => {
    const db = await TH.emptyDatabase()
    await TH.requestFor(db, 'u1').createBundle(TH.bundleOf('u1'))
    await db.exec('CREATE ROLE stranger; GRANT SELECT, INSERT ON safebyok_bundles TO stranger')
    try {
      await db.exec('SET ROLE stranger')
      const { rows } = await db.query('SELECT * FROM safebyok_bundles')
      expect(rows).to.have.lengthOf(0)
      const refusal = await TH.refusalOf(TH.requestFor(db, 'u2').createBundle(TH.bundleOf('u2')))
      expect(refusal.kind).to.eq('storage_unavailable')
    } finally {
      await db.exec('RESET ROLE; DROP OWNED BY stranger; DROP ROLE stranger')
    }
  })
})

describe("VaultChangeChannel", () => {
  it("is the channel a listen hook is handed", () => {
    expect(VaultChangeChannel).to.eq('safebyok_vault_changes')
  })
})

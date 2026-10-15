import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { get, promisifyRequest, set } from 'idb-keyval'
import { inOneTransaction, shelfOf } from '../src/shelf'
import * as TH from './test-helpers'

describe("shelfOf", () => {
  it("answers one shelf per database, kept in '<dbName>:vault_db'", async () => {
    const dbName = TH.freshDbName()
    expect(shelfOf(dbName)).to.eq(shelfOf(dbName))
    await set('ckey', 'row', shelfOf(dbName))
    const databases = await indexedDB.databases()
    expect(databases.map((database) => database.name)).to.include(`${dbName}:vault_db`)
  })
})

describe("inOneTransaction", () => {
  it("resolves with what its work resolves with, once its writes have committed", async () => {
    const shelf = shelfOf(TH.freshDbName())
    const outcome = await inOneTransaction(shelf, async (store) => {
      const standing: unknown = await promisifyRequest<unknown>(store.get('ckey'))
      store.put('written', 'ckey')
      return standing ?? 'nothing'
    })
    expect(outcome).to.eq('nothing')
    expect(await get('ckey', shelf)).to.eq('written')
  })

  it("keeps none of its writes when its work fails after asking for them", async () => {
    const shelf = shelfOf(TH.freshDbName())
    await set('ckey', 'before', shelf)
    const failing = inOneTransaction(shelf, async (store) => {
      store.put('after', 'ckey')
      await promisifyRequest(store.get('ckey'))
      throw new Error('the work failed')
    })
    await expect(failing).rejects.toThrow('the work failed')
    expect(await get('ckey', shelf)).to.eq('before')
  })

  it("rejects, keeping nothing, when a request in it fails", async () => {
    const shelf = shelfOf(TH.freshDbName())
    const failing = inOneTransaction(shelf, async (store) => {
      store.put('one', 'first')
      await promisifyRequest(store.add('two', 'first'))
      return 'never'
    })
    await expect(failing).rejects.toThrow()
    expect(await get('first', shelf)).to.be.undefined
  })

  it("runs two transactions over one shelf one after the other, never interleaved", async () => {
    const shelf = shelfOf(TH.freshDbName())
    await set('count', 0, shelf)
    const increment = () => inOneTransaction(shelf, async (store) => {
      const count = await promisifyRequest(store.get('count')) as number
      store.put(count + 1, 'count')
    })
    await Promise.all([increment(), increment(), increment()])
    expect(await get('count', shelf)).to.eq(3)
  })
})

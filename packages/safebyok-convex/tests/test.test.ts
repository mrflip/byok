import { describe, expect, it } from 'vitest'
import { defineTestApp } from 'convex-test'
import { defineSchema } from 'convex/server'
import { SafebyokComponent } from '../src/server'
import { register } from '../src/test'
import { bundleOf, scopeOf } from './helpers'

describe("register", () => {
  it("installs the component under the name a host gave it, and hands back its functions", async () => {
    const t = defineTestApp({ schema: defineSchema({}) }).defineModules({}).createTest()
    const vaultstore = register(t, 'vaultstore')
    await t.mutation(vaultstore.vaults.createBundle, { bundle: bundleOf('u1') })
    expect(await t.query(vaultstore.vaults.getBundle, { scope: scopeOf('u1') })).to.deep.equal(bundleOf('u1'))
  })

  it("serves a host app's re-exported functions, as defineTestApp's component helper", async () => {
    const app = defineTestApp({ schema: defineSchema({}), components: { safebyok: { register } } })
    const { api, createTest } = app.defineModules({
      safebyok: new SafebyokComponent(app.components.safebyok).api({ getUserId: () => 'u1' }),
    })
    const t = createTest()
    await t.mutation(api.safebyok.createBundle, { bundle: bundleOf('u1') })
    expect(await t.query(api.safebyok.getBundle, { scope: scopeOf('u1') })).to.deep.equal(bundleOf('u1'))
  })
})

import { AnyTextValidators, VaultDB, VaultError, type BundleExpectation, type EraseExpectation, type Lockbox, type LockboxExpectation, type VaultBundle, type VaultScope } from 'safebyok'

/**
 * DEMO JANK: a pretend backend outage, switched on and off from the backend inspection panel, so
 * you can watch the app say "Can't reach your vault" in place and retry. A real app has no such
 * switch: its adapter refuses as `storage_unavailable` when its backend really is down.
 */
export type Outage = {
  /** True while the pretend backend is down. */
  isDown: () => boolean
  /** Take the pretend backend down, or bring it back. */
  setDown: (down: boolean) => void
  /** Calls `listener` whenever the switch flips; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void
}

/**
 * An outage switch, starting up (the backend reachable).
 *
 * @example
 *   const outage = makeOutage()
 *   outage.setDown(true)
 *   outage.isDown()  // true
 */
export const makeOutage = (): Outage => {
  let down = false
  const listeners = new Set<() => void>()
  return {
    isDown: () => down,
    setDown: (nowDown) => {
      if (nowDown === down) { return }
      down = nowDown
      listeners.forEach((listener) => { listener() })
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/**
 * A VaultDB that hands every call through to `inner`, except while `outage` is down: then every
 * read and write refuses as `storage_unavailable`, as a real adapter does when its backend cannot
 * be reached. Watching for changes carries on through an outage, as a live query's socket would
 * reconnect. Its own verbs check every name with the vault's validators, so it hands each call on
 * with `AnyTextValidators`, letting through to `inner` whatever they passed.
 *
 * @example
 *   const vaultDB = new OutageVaultDB(idbVaultDB({ dbName: 'safebyok_demo' }), outage)
 */
export class OutageVaultDB extends VaultDB {
  readonly maxRecordBytes: number
  readonly maxVaultBytes: number
  private readonly inner: VaultDB
  private readonly outage: Outage

  /**
   * @param inner - The adapter that really stores the vault.
   * @param outage - The switch that takes it down.
   */
  constructor(inner: VaultDB, outage: Outage) {
    super()
    this.inner = inner
    this.outage = outage
    this.maxRecordBytes = inner.maxRecordBytes
    this.maxVaultBytes = inner.maxVaultBytes
  }

  protected async doReadBundle(scope: VaultScope): Promise<unknown> {
    this.refuseWhileDown()
    return await this.inner.readBundle(scope, AnyTextValidators)
  }

  protected async doCreateBundle(bundle: VaultBundle): Promise<unknown> {
    this.refuseWhileDown()
    return await this.inner.createBundle(bundle, AnyTextValidators)
  }

  // The inner adapter's public verbs refuse a failed expectation as stale_write themselves, and a
  // VaultError passes through this adapter's verbs untouched: so reaching the end means it landed.
  protected async doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean> {
    this.refuseWhileDown()
    await this.inner.updateBundle(bundle, expected, AnyTextValidators)
    return true
  }

  protected async doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    this.refuseWhileDown()
    return await this.inner.readBox(scope, boxlabel, AnyTextValidators)
  }

  // The inner list hands back public summaries, without the `format` this adapter's own list
  // verb checks for, so each lockbox is read whole; one erased between the list and its read is
  // simply gone.
  protected async doListBoxes(scope: VaultScope): Promise<unknown[]> {
    this.refuseWhileDown()
    const summaries = await this.inner.listBoxes(scope, AnyTextValidators)
    const lockboxes = await Promise.all(summaries.map((summary) => this.inner.readBox(scope, summary.boxlabel, AnyTextValidators)))
    return lockboxes.filter((lockbox) => lockbox !== null)
  }

  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<boolean> {
    this.refuseWhileDown()
    await this.inner.updateBox(scope, lockbox, expected, AnyTextValidators)
    return true
  }

  protected async doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<boolean> {
    this.refuseWhileDown()
    await this.inner.eraseBox(scope, boxlabel, expected, AnyTextValidators)
    return true
  }

  protected async doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean> {
    this.refuseWhileDown()
    await this.inner.eraseVault(scope, expected, AnyTextValidators)
    return true
  }

  protected override doSubscribe(scope: VaultScope, onChange: () => void): () => void {
    return this.inner.subscribe(scope, onChange, AnyTextValidators)
  }

  private refuseWhileDown(): void {
    if (this.outage.isDown()) {
      throw new VaultError('storage_unavailable', "The pretend backend is down: switch the outage off in the backend panel below, then retry.")
    }
  }
}

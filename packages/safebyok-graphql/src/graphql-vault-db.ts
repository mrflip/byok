import { VaultDB, VaultError, VaultErrorKindVals } from 'safebyok'
import type { BundleExpectation, EraseExpectation, Lockbox, LockboxExpectation, VaultBundle, VaultErrorKind, VaultScope } from 'safebyok'
import type { AnyVariables, Client, CombinedError, OperationResult } from '@urql/core'
import { BundleFields, ListedLockboxFields, LockboxFields, ScopeFields, recordOf, selectionOf } from './fields'

/**
 * What graphqlVaultDB needs of an urql Client: its three ways to send an operation. The Client
 * your app already has is one, whatever its exchanges.
 */
export type GraphqlVaultClient = Pick<Client, 'query' | 'mutation' | 'subscription'>

/**
 * safebyok's storage over GraphQL, in the browser: a VaultDB whose every verb is one operation,
 * sent through your app's urql Client to a server serving `VaultSchemaSdl` with `vaultResolvers`
 * (from `safebyok-graphql/server`), which runs each on a VaultDB made there for the signed-in
 * user. Hand it to `openVault` as its `vaultDB`.
 *
 * * **Every query goes to the network** (`requestPolicy: 'network-only'`): your Client's cache
 *   never answers for a vault.
 * * **A refusal crosses**: the server's VaultError comes back as the same VaultError, kind and
 *   message. Anything else that goes wrong -- the network, a server that is not serving the
 *   schema -- refuses with kind `storage_unavailable`, urql's own error as its `cause`.
 * * **Other writes** reach `subscribe` through the `safebyokVaultChanged` subscription, when your
 *   Client has a way to send subscriptions (a `subscriptionExchange` over graphql-ws, say, or
 *   `fetchSubscriptions`); without one, nothing is pushed, and the vault refreshes after its own
 *   writes as before. A subscription that fails is not retried, and nothing is told.
 *
 * @param client - Your app's urql Client, its `url` your GraphQL server's.
 * @returns The VaultDB, holding at most 1 MiB in one record, as the Postgres VaultDB behind it
 *   does, and setting no limit on one vault.
 *
 * @example
 *   const vaultDB = graphqlVaultDB(new Client({ url: '/api/graphql', exchanges: [fetchExchange] }))
 *   const vault = await openVault({ ...browserOpts(), applabel: 'acme', userId, vaultlabel: 'main', vaultDB })
 */
export const graphqlVaultDB = (client: GraphqlVaultClient): VaultDB => {
  if (! isUrqlClient(client)) {
    throw new VaultError('bad_option', "graphqlVaultDB needs an urql Client: your app's own, made with `new Client({ url, exchanges })` from @urql/core or urql.")
  }
  return new UrqlVaultDB(client)
}

const isUrqlClient = (client: unknown): client is GraphqlVaultClient => {
  if (typeof client !== 'object' || client === null) { return false }
  const sends = client as Partial<Record<keyof GraphqlVaultClient, unknown>>
  return typeof sends.query === 'function' && typeof sends.mutation === 'function' && typeof sends.subscription === 'function'
}

// ---------------------------------------------------------------------------------- the operations

const Scope = '$scope: SafebyokVaultScopeInput!'
const BundleSelection = selectionOf(BundleFields)

const ReadBundleDoc = `query SafebyokReadBundle(${Scope}) {
  safebyokReadBundle(scope: $scope) { ${BundleSelection} }
}`
const ReadBoxDoc = `query SafebyokReadBox(${Scope}, $boxlabel: String!) {
  safebyokReadBox(scope: $scope, boxlabel: $boxlabel) { ${selectionOf(LockboxFields)} }
}`
const ListBoxesDoc = `query SafebyokListBoxes(${Scope}) {
  safebyokListBoxes(scope: $scope) { ${selectionOf(ListedLockboxFields)} }
}`
const CreateBundleDoc = `mutation SafebyokCreateBundle($bundle: SafebyokVaultBundleInput!) {
  safebyokCreateBundle(bundle: $bundle) { ${BundleSelection} }
}`
const UpdateBundleDoc = `mutation SafebyokUpdateBundle($bundle: SafebyokVaultBundleInput!, $expected: SafebyokBundleExpectationInput!) {
  safebyokUpdateBundle(bundle: $bundle, expected: $expected)
}`
const UpdateBoxDoc = `mutation SafebyokUpdateBox(${Scope}, $lockbox: SafebyokLockboxInput!, $expected: SafebyokLockboxExpectationInput!) {
  safebyokUpdateBox(scope: $scope, lockbox: $lockbox, expected: $expected)
}`
const EraseBoxDoc = `mutation SafebyokEraseBox(${Scope}, $boxlabel: String!, $expected: SafebyokEraseExpectationInput!) {
  safebyokEraseBox(scope: $scope, boxlabel: $boxlabel, expected: $expected)
}`
const EraseVaultDoc = `mutation SafebyokEraseVault(${Scope}, $expected: SafebyokEraseExpectationInput!) {
  safebyokEraseVault(scope: $scope, expected: $expected)
}`
const VaultChangedDoc = `subscription SafebyokVaultChanged(${Scope}) {
  safebyokVaultChanged(scope: $scope) { ${selectionOf(ScopeFields)} }
}`

/**
 * Every operation graphqlVaultDB sends, by the root field it asks for: for a test to hold them
 * to the schema.
 */
export const VaultOperations = {
  safebyokReadBundle:   ReadBundleDoc,
  safebyokReadBox:      ReadBoxDoc,
  safebyokListBoxes:    ListBoxesDoc,
  safebyokCreateBundle: CreateBundleDoc,
  safebyokUpdateBundle: UpdateBundleDoc,
  safebyokUpdateBox:    UpdateBoxDoc,
  safebyokEraseBox:     EraseBoxDoc,
  safebyokEraseVault:   EraseVaultDoc,
  safebyokVaultChanged: VaultChangedDoc,
} as const

// ------------------------------------------------------------------------------------ the adapter

/** Each verb one operation; the base class validates both ways, and the server checks the user. */
class UrqlVaultDB extends VaultDB {
  // What the Postgres VaultDB behind the server holds in one record, and about what a GraphQL
  // server accepts in one request by default.
  readonly maxRecordBytes = 1024 * 1024
  // Nothing here reads a vault under a budget: the server's storage sets what it sets.
  readonly maxVaultBytes = Infinity

  private readonly client: GraphqlVaultClient

  constructor(client: GraphqlVaultClient) {
    super()
    this.client = client
  }

  protected async doReadBundle(scope: VaultScope): Promise<unknown> {
    const { safebyokReadBundle } = await this.asked(ReadBundleDoc, { scope: scopeOut(scope) })
    return recordOf(safebyokReadBundle, BundleFields)
  }

  protected async doCreateBundle(bundle: VaultBundle): Promise<unknown> {
    const { safebyokCreateBundle } = await this.told(CreateBundleDoc, { bundle: recordOf(bundle, BundleFields) })
    return recordOf(safebyokCreateBundle, BundleFields)
  }

  // A stale write refuses on the server and crosses as its kind, so a write that answers landed.
  protected async doUpdateBundle(bundle: VaultBundle, expected: BundleExpectation): Promise<boolean> {
    const { vault_id, passphrase_epoch } = expected
    await this.told(UpdateBundleDoc, { bundle: recordOf(bundle, BundleFields), expected: { vault_id, passphrase_epoch } })
    return true
  }

  protected async doReadBox(scope: VaultScope, boxlabel: string): Promise<unknown> {
    const { safebyokReadBox } = await this.asked(ReadBoxDoc, { scope: scopeOut(scope), boxlabel })
    return recordOf(safebyokReadBox, LockboxFields)
  }

  protected async doListBoxes(scope: VaultScope): Promise<unknown[]> {
    const { safebyokListBoxes } = await this.asked(ListBoxesDoc, { scope: scopeOut(scope) })
    return (safebyokListBoxes as unknown[]).map((listed) => recordOf(listed, ListedLockboxFields))
  }

  protected async doUpdateBox(scope: VaultScope, lockbox: Lockbox, expected: LockboxExpectation): Promise<boolean> {
    const { vault_id, revision_id } = expected
    await this.told(UpdateBoxDoc, { scope: scopeOut(scope), lockbox: recordOf(lockbox, LockboxFields), expected: { vault_id, revision_id } })
    return true
  }

  protected async doEraseBox(scope: VaultScope, boxlabel: string, expected: EraseExpectation): Promise<boolean> {
    await this.told(EraseBoxDoc, { scope: scopeOut(scope), boxlabel, expected: { vault_id: expected.vault_id } })
    return true
  }

  protected async doEraseVault(scope: VaultScope, expected: EraseExpectation): Promise<boolean> {
    await this.told(EraseVaultDoc, { scope: scopeOut(scope), expected: { vault_id: expected.vault_id } })
    return true
  }

  protected override doSubscribe(scope: VaultScope, onChange: () => void): () => void {
    const subscription = this.client.subscription(VaultChangedDoc, { scope: scopeOut(scope) }).subscribe((result) => {
      if (result.data) { onChange() }
    })
    return () => { subscription.unsubscribe() }
  }

  /** The answer to a query, from the server and never a cache. */
  private async asked(document: string, variables: AnyVariables): Promise<Record<string, unknown>> {
    return answerOf(await this.client.query(document, variables, { requestPolicy: 'network-only' }).toPromise())
  }

  /** The answer to a mutation. */
  private async told(document: string, variables: AnyVariables): Promise<Record<string, unknown>> {
    return answerOf(await this.client.mutation(document, variables).toPromise())
  }
}

const scopeOut = (scope: VaultScope) => recordOf(scope, ScopeFields)

/** An operation's data, or what it was refused with: the server's VaultError, or urql's error. */
const answerOf = (result: OperationResult): Record<string, unknown> => {
  if (result.error) { throw refusalOf(result.error) }
  if (! result.data) {
    throw new Error('The GraphQL server answered with neither data nor an error: is it serving safebyok-graphql?')
  }
  return result.data as Record<string, unknown>
}

/** The server's refusal as the VaultError it was, when one carries a kind; otherwise urql's error, as it is. */
const refusalOf = (err: CombinedError): Error => {
  for (const refused of err.graphQLErrors) {
    const { kind } = refused.extensions
    if (isKind(kind)) { return new VaultError(kind, refused.message) }
  }
  return err
}

const isKind = (kind: unknown): kind is VaultErrorKind => (VaultErrorKindVals as readonly unknown[]).includes(kind)

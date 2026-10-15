import { PGlite } from '@electric-sql/pglite'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { Client, cacheExchange } from '@urql/core'
import { executeExchange } from '@urql/exchange-execute'
import type { GraphQLSchema } from 'graphql'
import type { VaultDB } from 'safebyok'
import type { VaultDBVerbs } from 'safebyok/testing'
import { VaultTablesSql, postgresVaultDB } from 'safebyok-postgres'
import type { PostgresClient, PostgresListen } from 'safebyok-postgres'
import { graphqlVaultDB } from '../src/index'
import { VaultSchemaSdl, vaultResolvers } from '../src/server'
import type { ServedVaultDB } from '../src/server'

// Everything the core's tests use too, so a test here star-imports this one module as TH.
export * from 'safebyok/testing'

const made: { db?: Promise<PGlite> } = {}

/**
 * This test file's database: one PGlite, made once with safebyok-postgres's tables in it. A
 * PGlite takes a second or so to start, so a file's tests share one and {@link emptyDatabase} it.
 */
export const database = (): Promise<PGlite> => {
  made.db ??= madeDatabase()
  return made.db
}

const madeDatabase = async (): Promise<PGlite> => {
  const db = new PGlite()
  await db.exec(VaultTablesSql)
  return db
}

/** This file's database, its tables emptied. */
export const emptyDatabase = async (): Promise<PGlite> => {
  const db = await database()
  await db.exec('TRUNCATE safebyok_lockboxes, safebyok_bundles')
  return db
}

/** A PGlite's own `listen`, called on its PGlite, as safebyok-postgres's README wires it. */
export const listenOn = (db: PGlite): PostgresListen => (channel, onNotify) => db.listen(channel, onNotify)

/** What the test server's context holds for one request: the user its auth signed in, or null. */
export type TestContext = { userId: string | null }

/** The VaultDB a request for `userId` gets: safebyok-postgres's, over `db`, listening there. */
export const requestFor = (db: PGlite, userId: string | null) => postgresVaultDB({ client: db, userId, listen: listenOn(db) })

/**
 * The schema a GraphQL server makes of {@link VaultSchemaSdl} and {@link vaultResolvers}, as
 * Yoga and Apollo do (graphql-tools' makeExecutableSchema), each request's VaultDB made by
 * `vaultDBFor` -- by default, safebyok-postgres's over `db`, for the context's user.
 */
export const schemaOver = (db: PGlite, vaultDBFor: (context: TestContext) => ServedVaultDB = ({ userId }) => requestFor(db, userId)): GraphQLSchema => (
  makeExecutableSchema({ typeDefs: VaultSchemaSdl, resolvers: vaultResolvers({ vaultDBFor }) })
)

/**
 * An urql Client signed in as `userId`, as a browser's would be, that runs each operation
 * in-process against `schema`, its context that user's. It has urql's document cache in front,
 * as an app's Client usually does.
 */
export const urqlClientFor = (schema: GraphQLSchema, userId: string | null): Client => new Client({
  url:       'https://app.example.test/api/graphql',
  exchanges: [cacheExchange, executeExchange({ schema, context: { userId } satisfies TestContext })],
})

/** The browser's VaultDB for `userId`: graphqlVaultDB over its own urql Client. */
export const browserFor = (schema: GraphQLSchema, userId: string | null): VaultDB => graphqlVaultDB(urqlClientFor(schema, userId))

/**
 * One VaultDB per user, each made for that user as a server makes one per request: the core's
 * suite reaches two users' vaults through one adapter, where a request is one user's.
 */
export const perUser = (vaultDBFor: (userId: string) => VaultDB): VaultDBVerbs => {
  const vaultDBs = new Map<string, VaultDB>()
  const as = ({ user_id }: { user_id: string }): VaultDB => {
    const known = vaultDBs.get(user_id)
    if (known) { return known }
    const vaultDB = vaultDBFor(user_id)
    vaultDBs.set(user_id, vaultDB)
    return vaultDB
  }
  const anyone = vaultDBFor('anyone')
  return {
    maxRecordBytes: anyone.maxRecordBytes,
    maxVaultBytes:  anyone.maxVaultBytes,
    readBundle:     (scope) => as(scope).readBundle(scope),
    createBundle:   (bundle) => as(bundle).createBundle(bundle),
    updateBundle:   (bundle, expected) => as(bundle).updateBundle(bundle, expected),
    readBox:        (scope, boxlabel) => as(scope).readBox(scope, boxlabel),
    listBoxes:      (scope) => as(scope).listBoxes(scope),
    updateBox:      (scope, lockbox, expected) => as(scope).updateBox(scope, lockbox, expected),
    eraseBox:       (scope, boxlabel, expected) => as(scope).eraseBox(scope, boxlabel, expected),
    eraseVault:     (scope, expected) => as(scope).eraseVault(scope, expected),
    subscribe:      (scope, onChange) => as(scope).subscribe(scope, onChange),
  }
}

/** A PostgresClient whose every statement rejects with `err`, as a driver does when the database is down. */
export const failingClient = (err: Error): PostgresClient => ({
  query: () => Promise.reject(err),
})

/** What `operation` rejected with; fails the test if it resolved. */
export const refusalOf = async (operation: Promise<unknown>): Promise<{ kind?: unknown, cause?: unknown, message?: unknown }> => {
  try {
    await operation
  } catch (err) {
    return err as { kind?: unknown }
  }
  throw new Error('the operation was not refused')
}

/** Resolves once `check` holds, looking every few milliseconds; rejects after two seconds. */
export const eventually = async (check: () => boolean): Promise<void> => {
  for (let ii = 0; ii < 400; ii += 1) {
    if (check()) { return }
    await new Promise((resolve) => { setTimeout(resolve, 5) })
  }
  throw new Error('it never came to pass')
}

/** A while for something that should not happen to have had its chance: fifty milliseconds. */
export const aWhile = (): Promise<void> => new Promise((resolve) => { setTimeout(resolve, 50) })

/** How often `onChange` got called, kept for a test to look at. */
export const changeCounter = () => {
  const heard = { count: 0 }
  return { heard, onChange: () => { heard.count += 1 } }
}

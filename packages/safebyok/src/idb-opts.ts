import * as Z from 'zod/mini'
import { VaultError } from './errors'

/**
 * The options the IndexedDB adapters share, and their parsers: not an entry point, so nothing
 * here is public beyond the types `safebyok/idb` re-exports.
 */

export type IdbOpts = {
  /** The IndexedDB database to keep records in: a name, never empty. Default 'safebyok'. */
  dbName?: string | undefined
}

/** The two safebyok shelves an IndexedDB database holds records on. */
export const IdbShelfVals = ['vault_db', 'device_db'] as const
/** Which of the two safebyok shelves an IndexedDB database holds records on. */
export type IdbShelf = typeof IdbShelfVals[number]

const DefaultDbName = 'safebyok'

const dbName = Z.string().check(Z.minLength(1))
const idbOpts = Z.object({ dbName: Z._default(dbName, DefaultDbName) })
const inspectorOpts = Z.extend(idbOpts, { shelf: Z.enum(IdbShelfVals) })

const badDbName = (said: string) => new VaultError('bad_option', `${said} takes an optional dbName, the name of the IndexedDB database to keep records in: non-empty text. Leave it out for '${DefaultDbName}'.`)

/**
 * The database an adapter keeps its records in: `opts.dbName`, or 'safebyok' when there is none.
 * Kind 'bad_option' for anything else, quoting none of it.
 *
 * @param opts - What the host handed the adapter, or nothing.
 * @param said - The function the host called, as the refusal names it.
 */
export const parseDbName = (opts: IdbOpts | undefined, said: string): string => {
  const checked = idbOpts.safeParse(opts ?? {})
  if (! checked.success) { throw badDbName(said) }
  return checked.data.dbName
}

/**
 * The database and shelf an inspector looks at. Kind 'bad_option' for a dbName that is not
 * non-empty text, or a shelf that is not one of {@link IdbShelfVals}.
 */
export const parseInspectorOpts = (opts: IdbOpts & { shelf: IdbShelf }): { dbName: string, shelf: IdbShelf } => {
  const checked = inspectorOpts.safeParse(opts)
  if (! checked.success) {
    throw new VaultError('bad_option', `inspectIdb takes a shelf, 'vault_db' or 'device_db', and an optional dbName of non-empty text (default '${DefaultDbName}').`)
  }
  return checked.data
}

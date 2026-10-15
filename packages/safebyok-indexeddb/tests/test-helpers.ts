/**
 * This package's test helpers, beside the core's (`safebyok/testing`), which they re-export, so
 * a test here star-imports this one module as TH.
 */
export * from 'safebyok/testing'

/**
 * A database name no other test uses, so each test's rows are its own.
 *
 * @example idbVaultDB({ dbName: TH.freshDbName() })
 */
export const freshDbName = () => `safebyok_test_${crypto.randomUUID().slice(0, 8)}`

/** What `operation` rejected with; fails the test if it resolved. */
export const refusalOf = async (operation: Promise<unknown>): Promise<{ kind?: unknown, message?: unknown }> => {
  try {
    await operation
  } catch (err) {
    return err as { kind?: unknown }
  }
  throw new Error('the operation was not refused')
}

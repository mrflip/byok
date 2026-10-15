/**
 * This package's test helpers, beside the core's (`safebyok/testing`), which they re-export, so
 * a test here star-imports this one module as TH. `TH.freshDbName()` is the core's.
 */
export * from 'safebyok/testing'

/** What `operation` rejected with; fails the test if it resolved. */
export const refusalOf = async (operation: Promise<unknown>): Promise<{ kind?: unknown, message?: unknown }> => {
  try {
    await operation
  } catch (err) {
    return err as { kind?: unknown }
  }
  throw new Error('the operation was not refused')
}

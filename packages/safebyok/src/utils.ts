/**
 * safebyok's small helpers for the app around a vault, in an entry point of their own so that an
 * app that wants one pulls in none of the vault: `import { mask } from 'safebyok/utils'`.
 */
export { mask } from './mask'
export type { MaskOpts } from './mask'

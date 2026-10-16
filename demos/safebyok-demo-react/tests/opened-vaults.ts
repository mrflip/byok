import type { Vault } from 'safebyok'

/** The vaults a test has opened from outside the page, not yet closed. */
const opened: Vault[] = []

/**
 * Notes a vault a test opened, for {@link closeOpenedVaults} to close when the test ends.
 *
 * @param vault - A vault the test opened.
 * @returns The same vault, so the call reads through.
 */
export const keepToClose = (vault: Vault): Vault => {
  opened.push(vault)
  return vault
}

/** Closes every vault noted since the last call, so none keeps watching storage after its test. */
export const closeOpenedVaults = (): void => {
  for (const vault of opened.splice(0)) { vault.close() }
}

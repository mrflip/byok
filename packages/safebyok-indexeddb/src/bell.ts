/**
 * The change bell: how a write tells everyone listening to its database, in this tab and in
 * every other. Listeners in this tab hear the bell directly; a BroadcastChannel carries it to the
 * other tabs of this origin (a channel never echoes to its own sender, so nothing hears twice).
 * The bell names no scope and carries nothing: a listener's only news is that something changed,
 * and it reads again. A backend of your own with push of its own (a live query, a socket) rings
 * from that instead.
 *
 * Under Node or Bun, where a test or a server-side render may open a vault, the channel never
 * keeps the process alive: it exits when its own work is done, as it would without the bell.
 */

const listenersByDbName = new Map<string, Set<() => void>>()
const channels = new Map<string, BroadcastChannel>()

// The channel's name is shared with every other tab, and with any other version of this package
// running in one, so it stays as it is.
const channelName = (dbName: string) => `safebyok-idb:${dbName}:vault_db`

// Each listener is called on its own, after the ringing code has run on, and one unsubscribed
// before its turn comes is not called. One that throws silences no other, fails no write, and
// never escapes as an uncaught error, which would end a Node or Bun process. Its error is
// dropped, not reported: the bell has no logger, and what a listener threw is the listener's
// own to report (the vault's own listener never throws: it logs a failed refresh itself).
const callEach = (listeners: Set<() => void> | undefined) => {
  listeners?.forEach((listener) => {
    queueMicrotask(() => {
      if (! listeners.has(listener)) { return }
      try {
        listener()
      } catch {
        // Dropped: see above.
      }
    })
  })
}

/**
 * Ring the bell of `dbName`: every listener in this tab, and over the BroadcastChannel, every
 * other tab's.
 *
 * @example ringBell('acme')  // after a write to the acme shelf has committed
 */
export const ringBell = (dbName: string): void => {
  callEach(listenersByDbName.get(dbName))
  channelOf(dbName)?.postMessage('changed')
}

/**
 * Calls `listener` whenever the bell of `dbName` rings, from this tab or another; returns the
 * unsubscribe. Where there is no BroadcastChannel, only this tab's writes are heard.
 *
 * @example
 *   const stop = onBell('acme', () => { void refresh() })
 *   stop()
 */
export const onBell = (dbName: string, listener: () => void): (() => void) => {
  channelOf(dbName)
  const listeners = listenersByDbName.get(dbName) ?? new Set()
  listenersByDbName.set(dbName, listeners)
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

// The channel of `dbName`, opened on first use by a write or a listener alike, so a tab that
// only writes still rings the others. None where the platform has no BroadcastChannel.
const channelOf = (dbName: string): BroadcastChannel | undefined => {
  if (typeof BroadcastChannel === 'undefined') { return undefined }
  const kept = channels.get(dbName)
  if (kept !== undefined) { return kept }
  const channel = new BroadcastChannel(channelName(dbName))
  channel.addEventListener('message', () => { callEach(listenersByDbName.get(dbName)) })
  letProcessExit(channel)
  channels.set(dbName, channel)
  return channel
}

// Node's and Bun's BroadcastChannel holds its process open until it is closed, and this one is
// kept for the life of the page; unref() lets the process exit regardless. A browser's has no
// unref, and needs none.
const letProcessExit = (channel: BroadcastChannel & { unref?: () => unknown }) => {
  if (typeof channel.unref === 'function') { channel.unref() }
}

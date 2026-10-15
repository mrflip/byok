import { Label, type StringStore } from 'safebyok'

/**
 * SCAFFOLDING a real host application replaces with its own auth (Google sign-in, Clerk, Convex
 * auth...). What the vault layer needs from auth is only what Session carries: a stable opaque
 * userId and a display userlabel. The demo fakes the rest: typing a userlabel signs you in,
 * creating the account on first sight.
 */
export type Session = {
  userId:    string
  userlabel: string
}

/** The demo's account row, in the pretend-remote database beside the vault rows. */
type Account = {
  user_id:       string
  userlabel:     string
  registered_at: number
}

export type Auth = {
  /** Current session or null; same object until it changes (useSyncExternalStore-ready). */
  getSnapshot: () => Session | null
  subscribe: (listener: () => void) => () => void
  /** Sign in as `userlabel`, creating the account on first sight. */
  signIn(userlabel: string): Promise<Session>
  /** End the session on this device. Touches no server-side data. */
  signOut(): void
  /** Delete the signed-in account's row and end the session. Vault rows are the caller's to clean up first. */
  deleteAccount(): Promise<void>
}

/**
 * Fake auth over the demo's two stores: accounts live in the pretend-remote `dbStore` (a backend
 * would own them), the session lives in the on-device `deviceStore` (a cookie would). Not a
 * pattern for production -- there is no password and no verification, by design: the vault
 * passphrase is deliberately a separate thing from signing in.
 *
 * @example
 *   const auth = createAuth({ applabel: 'acme', dbStore, deviceStore })
 *   const session = await auth.signIn('margo')  // { userId: 'user_3f...', userlabel: 'margo' }
 */
export const createAuth = (opts: { applabel: string, dbStore: StringStore, deviceStore: StringStore }): Auth => {
  const { applabel, dbStore, deviceStore } = opts
  const accountCkey = (userlabel: string) => `account:${applabel}:${userlabel}`
  const sessionCkey = `session:${applabel}`

  let session: Session | null = readSession()
  const listeners = new Set<() => void>()
  const bump = () => { listeners.forEach((listener) => { listener() }) }

  function readSession(): Session | null {
    const text = deviceStore.read(sessionCkey)
    if (text === null) { return null }
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && 'userId' in parsed && 'userlabel' in parsed) {
        return parsed as Session
      }
    } catch { /* fall through: a mangled session reads as signed out */ }
    deviceStore.erase(sessionCkey)
    return null
  }

  return {
    getSnapshot: () => session,

    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },

    signIn: (userlabel) => {
      const checked = Label.safeParse(userlabel)
      if (! checked.success) {
        return Promise.reject(new Error('A username is 2-64 letters, digits and underscores, starting with a letter.'))
      }
      const ckey = accountCkey(checked.data)
      const existing = dbStore.read(ckey)
      const account: Account = existing === null
        ? { user_id: randomId(), userlabel: checked.data, registered_at: Date.now() }
        : JSON.parse(existing) as Account
      if (existing === null) { dbStore.write(ckey, JSON.stringify(account)) }
      session = { userId: account.user_id, userlabel: account.userlabel }
      deviceStore.write(sessionCkey, JSON.stringify(session))
      bump()
      return Promise.resolve(session)
    },

    signOut: () => {
      session = null
      deviceStore.erase(sessionCkey)
      bump()
    },

    deleteAccount: () => {
      if (session === null) { return Promise.resolve() }
      dbStore.erase(accountCkey(session.userlabel))
      session = null
      deviceStore.erase(sessionCkey)
      bump()
      return Promise.resolve()
    },
  }
}

/** Opaque id from the platform CSPRNG: sixteen hex characters under a `user_` prefix. */
const randomId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return 'user_' + [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

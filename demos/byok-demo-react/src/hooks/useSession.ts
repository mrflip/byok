import { useSyncExternalStore } from 'react'
import type { Auth, Session } from '../lib/auth'

/** The current session from the demo's fake auth, live: null while signed out. */
export const useSession = (auth: Auth): Session | null => (
  useSyncExternalStore(auth.subscribe, auth.getSnapshot)
)

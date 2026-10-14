import { createAuth } from './scaffold/auth'
import { VaultProvider, useSession } from './scaffold/vault-context'
import { Inspector } from './demo/inspector'
import { LockboxPanel } from './demo/lockbox-panel'
import { SessionBar } from './demo/session-bar'
import { Applabel, dbStore, deviceDB, deviceStore, vaultDB } from './demo/stores'

/**
 * The whole demo on one page: the "app" on top (sign in, manage lockboxes), the inspector below
 * (what actually landed in each store). Module-level singletons are DEMO JANK; a real app builds
 * its adapters wherever it wires its other services.
 */

const auth = createAuth({ applabel: Applabel, dbStore, deviceStore })

const AppHalf = () => {
  const session = useSession(auth)
  return (
    <section className="app-half">
      <h1>byok playground</h1>
      <p className="quiet">
        A pretend app whose users bring their own API keys. Secrets live in lockboxes inside a
        per-user vault; the backend below holds only what the vault writes through it.
      </p>
      <SessionBar auth={auth} />
      {session !== null && <LockboxPanel />}
    </section>
  )
}

export const App = () => (
  <VaultProvider auth={auth} applabel={Applabel} vaultlabel="main" vaultDB={vaultDB} deviceDB={deviceDB}>
    <main>
      <AppHalf />
      <hr />
      <Inspector />
    </main>
  </VaultProvider>
)

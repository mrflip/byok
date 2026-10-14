import { VaultProvider } from 'byok-react'
import { KnockKnock } from './components/KnockKnock'
import { SessionBar } from './components/SessionBar'
import { VaultDashboard } from './components/VaultDashboard'
import { DeviceDBInspectionPanel } from './components/inspection/DeviceDBInspectionPanel'
import { VaultDBInspectionPanel } from './components/inspection/VaultDBInspectionPanel'
import { createAuth } from './lib/auth'
import { Applabel, dbStore, deviceDB, deviceStore, vaultDB } from './lib/stores'
import { useSession } from './hooks/useSession'

// The demo's fake auth; a real app has its own (Google, Clerk, Convex...). All the vault needs
// from it is a stable userId.
const auth = createAuth({ applabel: Applabel, dbStore, deviceStore })

const Page = () => {
  const session = useSession(auth)
  return (
    <main>
      <h1>byok playground</h1>
      <p className="quiet">
        A pretend app whose users bring their own API keys. Secrets live in lockboxes inside a
        per-user vault; the backend holds only what the vault writes through it.
      </p>
      <SessionBar auth={auth} />
      {session !== null && (
        <>
          <KnockKnock />
          <VaultDashboard />
        </>
      )}

      <hr />
      {/* Demo-only inspection panels. To remove them: delete the two components below (and
          their imports), then delete src/components/inspection/. Nothing else references it. */}
      <VaultDBInspectionPanel />
      <DeviceDBInspectionPanel />
    </main>
  )
}

export const App = () => {
  const session = useSession(auth)
  return (
    <VaultProvider
      applabel={Applabel}
      vaultlabel="main"
      userId={session?.userId ?? null}
      vaultDB={vaultDB}
      deviceDB={deviceDB}
    >
      <Page />
    </VaultProvider>
  )
}

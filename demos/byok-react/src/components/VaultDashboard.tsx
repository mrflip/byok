import { useState } from 'react'
import { useVault, useVaultSnapshot } from '../scaffold/vault-context'
import { PsstModal } from './psst-modal'
import type { Whisper } from '../byok'

/**
 * DEMO JANK: the "app"'s lockbox manager. The lines that matter -- the effortless mechanics a
 * real app would write -- are the one-liners inside each handler: `vault.store(...)`,
 * `vault.read(...)`, `vault.use(...)`, `vault.erase(...)`, each wrapped in `guard()` so a locked
 * vault summons the passphrase dialog and retries. Everything else here is table furniture.
 */

/** A whisper as the demo prints it: strings bare, everything else as JSON. */
const showWhisper = (whisper: Whisper): string => (
  typeof whisper === 'string' ? whisper : JSON.stringify(whisper)
)

/** A whisper as the edit box holds it. */
const editableWhisper = (whisper: Whisper): string => (
  typeof whisper === 'string' ? whisper : JSON.stringify(whisper, null, 2)
)

/** The edit box, read back: valid JSON keeps its type, anything else is a string. */
const parseWhisperText = (text: string): Whisper => {
  try {
    return JSON.parse(text) as Whisper
  } catch {
    return text
  }
}

type FormState = { editing: string | null, boxlabelText: string, whisperText: string, noteText: string }
const blankForm: FormState = { editing: null, boxlabelText: '', whisperText: '', noteText: '' }

export const LockboxPanel = () => {
  const { vault, guard } = useVault()
  const snapshot = useVaultSnapshot()
  const [form, setForm] = useState<FormState | null>(null)
  const [shown, setShown] = useState<Record<string, Whisper>>({})
  const [psst, setPsst] = useState<{ boxlabel: string, whisper: Whisper } | null>(null)
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null) { return <p className="quiet">Opening vault…</p> }

  // guard() returns null when the user dismisses the passphrase dialog; the box below
  // distinguishes that from a legitimately-null whisper.
  const view = (boxlabel: string) => guard(async () => ({ whisper: await vault.read(boxlabel) }))
    .then((got) => { if (got !== null) { setShown((prev) => ({ ...prev, [boxlabel]: got.whisper })) } })

  const hide = (boxlabel: string) => {
    setShown(({ [boxlabel]: _gone, ...rest }) => rest)
  }

  const edit = (boxlabel: string, noteText: string) => guard(async () => ({ whisper: await vault.read(boxlabel) }))
    .then((got) => {
      if (got !== null) { setForm({ editing: boxlabel, boxlabelText: boxlabel, whisperText: editableWhisper(got.whisper), noteText }) }
    })

  const erase = async (boxlabel: string) => {
    if (! window.confirm(`Delete the lockbox '${boxlabel}'?`)) { return }
    await guard(() => vault.erase(boxlabel))
    hide(boxlabel)
  }

  const useWhisper = (boxlabel: string) => guard(() => vault.use(boxlabel, (whisper) => { setPsst({ boxlabel, whisper }) }))

  const save = async () => {
    if (form === null) { return }
    setGripe(null)
    try {
      const saved = await guard(async () => {
        await vault.store(form.boxlabelText.trim(), parseWhisperText(form.whisperText), { note: form.noteText.trim() || undefined })
        return true
      })
      if (saved !== null) { setForm(null) }
    } catch (err) {
      setGripe(err instanceof Error ? err.message : 'Could not store that.')
    }
  }

  return (
    <div className="lockbox-panel">
      <div className="row spread">
        <h2>Lockboxes <span className="quiet">vault “{snapshot.scope.vaultlabel}”</span></h2>
        <LockChip state={snapshot.state} expiresAt={snapshot.expiresAt} onLock={() => { void vault.lock() }} />
      </div>

      {snapshot.boxes.length === 0 && <p className="quiet">No lockboxes yet. Secrets you add live encrypted in the database (in this stub: plaintext, see below) and open only on your device.</p>}

      {snapshot.boxes.length > 0 && (
        <table>
          <thead>
            <tr><th>label</th><th>whisper</th><th>note</th><th>updated</th><th></th></tr>
          </thead>
          <tbody>
            {snapshot.boxes.map((box) => (
              <tr key={box.boxlabel}>
                <td><code>{box.boxlabel}</code></td>
                <td className="whisper-cell">
                  {box.boxlabel in shown
                    ? <><code>{showWhisper(shown[box.boxlabel] ?? null)}</code> <button className="mini" onClick={() => { hide(box.boxlabel) }}>hide</button></>
                    : <><span className="quiet">••••••••</span> <button className="mini" onClick={() => { void view(box.boxlabel) }}>view</button></>}
                </td>
                <td className="quiet">{box.note}</td>
                <td className="quiet">{new Date(box.updated_at).toLocaleString()}</td>
                <td className="row">
                  <button className="mini" onClick={() => { void useWhisper(box.boxlabel) }}>use</button>
                  <button className="mini" onClick={() => { void edit(box.boxlabel, box.note ?? '') }}>edit</button>
                  <button className="mini danger" onClick={() => { void erase(box.boxlabel) }}>delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {form === null
        ? <button onClick={() => { setForm(blankForm) }}>Add a lockbox</button>
        : (
          <div className="lockbox-form">
            <h3>{form.editing === null ? 'New lockbox' : `Edit ${form.editing}`}</h3>
            <label>
              label
              <input
                placeholder="ANTHROPIC_API_KEY"
                value={form.boxlabelText}
                disabled={form.editing !== null}
                onChange={(evt) => { setForm({ ...form, boxlabelText: evt.target.value }) }}
              />
            </label>
            <label>
              whisper <span className="quiet">(valid JSON keeps its type; anything else is stored as a string)</span>
              <textarea
                placeholder="sk-ant-..."
                value={form.whisperText}
                onChange={(evt) => { setForm({ ...form, whisperText: evt.target.value }) }}
              />
            </label>
            <label>
              note <span className="quiet">(public: visible without the passphrase)</span>
              <input
                placeholder="personal account"
                value={form.noteText}
                onChange={(evt) => { setForm({ ...form, noteText: evt.target.value }) }}
              />
            </label>
            {gripe !== null && <p className="gripe">{gripe}</p>}
            <div className="row">
              <button onClick={() => { void save() }}>Save</button>
              <button onClick={() => { setForm(null); setGripe(null) }}>Cancel</button>
            </div>
          </div>
        )}

      {psst !== null && <PsstModal boxlabel={psst.boxlabel} whisperShown={showWhisper(psst.whisper)} onClose={() => { setPsst(null) }} />}
    </div>
  )
}

const LockChip = ({ state, expiresAt, onLock }: { state: string, expiresAt: number | null, onLock: () => void }) => {
  if (state === 'unlocked') {
    return (
      <span className="row">
        <span className="chip unlocked">🔓 unlocked{expiresAt !== null && ` until ${new Date(expiresAt).toLocaleString()}`}</span>
        <button className="mini" onClick={onLock}>lock now</button>
      </span>
    )
  }
  if (state === 'locked') { return <span className="chip locked">🔒 locked</span> }
  if (state === 'absent') { return <span className="chip">no vault yet</span> }
  return <span className="chip">…</span>
}

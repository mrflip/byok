import { useState } from 'react'
import { useVault, useVaultSnapshot } from 'byok-react'
import { editableWhisper, parseWhisperText, showWhisper } from '../lib/whisper-text'
import { PsstModal } from './PsstModal'
import type { Whisper } from 'byok'

/**
 * Direct manipulation of the vault's lockboxes: add, view, edit, delete, use. The lines that
 * matter are the one-liners inside each handler -- `vault.store(...)`, `vault.read(...)`,
 * `vault.use(...)`, `vault.erase(...)`, each wrapped in `guard()` so a locked vault summons the
 * passphrase dialog and retries. Everything else is table furniture.
 */

type FormState = { editing: string | null, boxlabelText: string, whisperText: string, noteText: string }
const blankForm: FormState = { editing: null, boxlabelText: '', whisperText: '', noteText: '' }

export const VaultDashboard = () => {
  const { vault, guard } = useVault()
  const snapshot = useVaultSnapshot()
  const [form, setForm] = useState<FormState | null>(null)
  const [shown, setShown] = useState<Record<string, Whisper>>({})
  const [psst, setPsst] = useState<{ boxlabel: string, whisper: Whisper } | null>(null)
  const [gripe, setGripe] = useState<string | null>(null)

  if (vault === null) { return <p className="quiet">Opening vault…</p> }

  // guard() returns null when the user dismisses the passphrase dialog; the wrapping object
  // below distinguishes that from a legitimately-null whisper.
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

  const applyWhisper = (boxlabel: string) => guard(() => vault.use(boxlabel, (whisper) => { setPsst({ boxlabel, whisper }) }))

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
    <section className="vault-dashboard">
      <div className="row spread">
        <h2>Vault dashboard <span className="quiet">vault “{snapshot.scope.vaultlabel}”</span></h2>
        <LockChip state={snapshot.state} expiresAt={snapshot.expiresAt} onLock={() => { void vault.lock() }} />
      </div>

      {snapshot.boxes.length === 0 && <p className="quiet">No lockboxes yet. Whispers you add live encrypted in the database (in this stub: plaintext, see below) and open only on your device.</p>}

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
                  <button className="mini" onClick={() => { void applyWhisper(box.boxlabel) }}>use</button>
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
                placeholder="anthropic_api_key"
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
    </section>
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

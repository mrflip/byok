/**
 * What the dashboard's "use" button does with a whisper: a real app hands it to an API client
 * inside `vault.use(...)`'s callback (as the knock-knock machine does); this just whispers it
 * back at you.
 */
export const PsstModal = ({ boxlabel, whisperShown, onClose }: { boxlabel: string, whisperShown: string, onClose: () => void }) => (
  <div className="modal-scrim" onClick={onClose}>
    <div className="modal" onClick={(evt) => { evt.stopPropagation() }}>
      <h3>Pssst: <code>{whisperShown}</code>. Don&apos;t tell.</h3>
      <p className="quiet">That was the whisper from <code>{boxlabel}</code>, decrypted on your device, shown to nobody else.</p>
      <button onClick={onClose}>My lips are sealed</button>
    </div>
  </div>
)

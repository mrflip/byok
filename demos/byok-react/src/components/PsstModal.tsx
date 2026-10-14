/**
 * DEMO JANK: what "using" a whisper looks like here. A real app would hand the whisper to an API
 * client inside `vault.use(...)`'s callback; the demo just whispers it back at you.
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

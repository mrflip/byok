---
"safebyok-react": patch
---

`PassphraseModal` words the unlock window as "Locks again on this device in 7 days" (phrased by `Intl.RelativeTimeFormat`, English for now; whole days, else hours, else minutes), and "Stays unlocked on this device until you lock it" for a window that lasts until `lock()`. Where the platform has no `Intl.RelativeTimeFormat`, the dialog keeps the older "Stays unlocked on this device for 7 days". A host that matched the dialog's text will see the new words.

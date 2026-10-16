---
"safebyok-react": patch
---

`PassphraseModal` words the unlock window as "Locks again on this device in 7 days" (phrased by `Intl.RelativeTimeFormat`, English for now; whole days, else hours, else minutes), and "Stays unlocked on this device until you lock it" for a window that lasts until `lock()`. While it creates a vault it reads "Locks on this device in 7 days". A host that matched the dialog's text will see the new words.

---
"safebyok-react": patch
---

`VaultProvider` no longer swallows a failed `openVault`: it throws the error while rendering, so an error boundary and the dev overlay show it. A bad label or option and unreachable storage were silent before.

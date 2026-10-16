---
"safebyok-indexeddb": patch
---

**`idbVaultDB` reads only the vault's own rows.** Listing a vault's lockboxes, and erasing a vault, used to read every row on the shelf, every user's and vault's, and filter them in memory; both now work on the key range under the vault's lockbox prefix, so their cost follows the vault, not the database. What is stored is unchanged.

**A write IndexedDB fails without saying why no longer carries a null cause.** When the browser reports no error for a failed request or an aborted transaction, the `storage_unavailable` refusal's `cause` is now an Error reading "The IndexedDB request failed for an unknown reason", never `null`.

**The change bell closes its BroadcastChannel when it is done with it.** The channel closes when the last listener of a database leaves (a vault's `close()`), and a write that finds no listener in the tab opens one only to tell the other tabs; it is opened afresh when next needed. It was kept open for the life of the page.

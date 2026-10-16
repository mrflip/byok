---
"safebyok": minor
---

`describeVaultDB` from `safebyok/testing` checks more of the VaultDB contract, tests that each adapter here used to write for itself: two updates of one bundle, two first writes of one lockbox and two replacements of one revision made at once, one landing and the other refused as `stale_write` (lines 3.2, 3.3); an erase made at once with a replacement, or with a write into the vault it erases, leaving nothing behind (3.4, 3.5); and text read back exactly as written, never Unicode-normalized, with two user ids that differ only in how a letter is composed kept apart (1.1, 1.2). A new option, `pushes: true`, runs line 6.1's push tests for an adapter whose `subscribe` calls back: it hears each kind of write, and an unsubscribed listener hears no more while another still does. An adapter that passed before may meet these for the first time; every adapter in this repository passes.

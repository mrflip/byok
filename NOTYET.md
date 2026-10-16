# NOT YET

Reasonable tasks that we do not plan to do in the near term. Do not anticipate them in your
implementation.

* **Lock out a device: every way in it added.** From another device, the user locks out a lost or
  compromised one: its passkeys removed, its remembered unlock void, and nothing it holds reading
  what is written next. Vault-key rotation does the cryptography (designed in
  `whiteboard/20261016-rotation/rotation-design.md`, built as sprint matters' threads 14 and
  18-20); what waits is the UX, a device list, and, if the Coach wants rotation not to sign every
  other device out, a key pair per way in (that design's open question 1). The data it needs goes
  in with rotation: a random `device_id` per vault per device, recorded on every envelope it adds.
  * **What we record now.** `device_id` is random, minted per vault per device, never derived from
    the device, so the backend can't link one device's vaults to each other. That reading follows
    Apple's ban on fingerprinting and Google's guidance to use a privately stored random ID; it is
    the agents' reading, not legal advice, and the Coach is "pretty sure the device id is ok".
  * **What is permitted to retain about devices -- open.** The Coach: are we allowed to store
    "Bob's Awesome iPhone 11" for the user to know which device `a213423bcf` is? A device list
    needs some label a person recognizes. Decide before building it: a label the user types (what
    they chose to say, stored in the clear on the server, or encrypted under the vaultKey so the
    server never sees it), a label taken from the platform (model name, user agent: the kind of
    data the fingerprinting rules care about), or none (the device list shows when each was added
    and last used). Encrypting a user-typed label inside the vault is the likely answer; check it
    against the host app's privacy review, which owns what its users are told.

* **The React binding under real assistive technology and real hosts.** The Coach (2026-10-16,
  sprint push_to_100_a, thread 7, [#129](https://github.com/mrflip/safebyok/pull/129)): not done,
  and not planned soon -- a real screen reader over the passphrase dialog, real shadow-DOM hosting,
  and a real browser rather than jsdom. G356 stays open for it.

* **The Postgres adapter's own tests on a real server.** The Coach (2026-10-16, sprint
  push_to_100_a, thread 11, [#131](https://github.com/mrflip/safebyok/pull/131)): not now. The
  container runs only the e2e suites; `packages/safebyok-postgres/tests/` still run on PGlite in
  process, because they are written against PGlite's interface. A small PGlite-shaped wrapper over
  a `pg` pool would let them run on the container too.

* **A conflict handler.** G499: a pluggable hook for odd conflicts, such as a lockbox too damaged
  to name its epoch meeting a healthy store. The settled design has none (VAULTDB.md: an erase
  wins, the last writer wins, and the vault never clears damage on its own, so `store()` over the
  box is the handler). The Coach (2026-10-16, sprint push_to_100_a, thread 4,
  [#132](https://github.com/mrflip/safebyok/pull/132)): leave it here, "so that when the idea
  keeps coming up there's some place to point to".

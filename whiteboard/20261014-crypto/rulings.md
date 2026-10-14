# Post-PR rulings (2026-10-14, Coach in chat)

The Coach's decisions on this thread's open questions and the next thread's shape, recorded as
ruled so the next thread starts from here, not from memory.

## The storage interface: versionedUpdate

* **The name is `versionedUpdate`** (not "CAS" or "compare-and-swap" -- jargon stays out).
  A versioned update saves a lockbox only if the standing record still carries the `revision_id`
  the writer read (or there is none), and saves a bundle only if the standing `passphrase_epoch`
  is the one proven against. A failed expectation refuses with a new error kind (`stale_write`).
* **Only call and only implement the smart verbs.** The Coach reversed the dumb-primitives
  layer: adapters implement the smart verbs directly, rather than seven fetch/save/trash
  primitives with compositions on top. Every realistic production backend does conditional
  writes natively (Convex mutations, SQL `UPDATE ... WHERE`, Firestore/Mongo transactions,
  DynamoDB conditional puts, S3 If-Match); the targets that lack them (memory, localStorage)
  are single-threaded enough that a synchronous check-then-save is atomic within a tab anyway.
  The base class keeps validation (shape, scope and label refusals) wrapped around the
  adapter's verbs, so an adapter author cannot forget it.
* **`store()` surfaces `stale_write` on first failure** -- the least-code option, right for the
  LEGO-set surface. TODO(soonish): a retry-up-to-a-limit politeness for the batteries-included
  surface.
* **Erase wins.** An erase is a clear, idempotent intent on a different path from update: no
  version expectation. TODO(with the retry work): a conflict-handler hook where a host could
  hear about erase-vs-update collisions.
* TODO(not yet): the IndexedDB adapter's `versionedUpdate` done truly atomically, inside a
  single IndexedDB transaction (idb-keyval's `update()`; synchronous updater, throw-to-abort
  mapped to `stale_write`). Until then it is check-then-save with a small window --
  `notes/security.md` says so.

## whisper_schema_version

* **Yes, and in public metadata** (beside `note`): the host app sets it at `store()`, reads it
  on the summary, and migrates after reading. Anyone worried that it leaks their data-shape
  generation can leave it at 1 forever and version inside the whisper themselves.
* **Not optional in the stored record**: zod fills it (default 1) at the first reasonable
  opportunity, so every stored lockbox carries a concrete value.
* Number vs string: Coach asked; agent recommends **integer** (ordering is the whole job:
  "stored < current, migrate" -- strings invite '1.10' < '1.2' bugs; `passphrase_epoch` is the
  in-house precedent; VOCABULARY already says "version number"). Awaiting the word.

## The boundary pattern (repo-wide TODO)

TODO: audit everywhere a record has "late" optional fields. The pattern the Coach named: a value
becomes **fully nulled, defaulted and validated when it crosses a critical boundary** (into
storage, out of storage, across the public API) **and is trusted otherwise**. Optionals that
exist only because a field arrives late should be resolved at the boundary, not carried.
First candidates: `Lockbox.note`, the new `whisper_schema_version`, `DeviceUnlock`'s shape.

## Expiry (under discussion)

The Coach floats (naive, treat carefully): a **stale window and an expires window** -- the
bartender shouting last call versus calling the cops, with deliberately no bouncer in between.
Agent's read: stale must change nothing mechanically (purely a snapshot signal the host may
prompt on); expired stays the hard stop. The one real policy fork: fixed-from-unlock versus
sliding-on-use expiry. Discussion continues in chat.

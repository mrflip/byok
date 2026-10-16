# TODO

Three shelves. **Roadmapped**: the order we build in, in flight or next, each a sprint or a thread.
**Side quests**: straightforward, likely to be done, not needed yet; pick one up when the roadmap
is blocked. **Soonish**: wanted, but a design question stands in the way; the note says which.
What is reasonable but deferred, and what waits until its irritant becomes a real hassle (RAGEBAIT),
is in `NOTYET.md`: do not anticipate either in your implementation.

## Sand in the sandals

Small irritants, each a few lines, picked up by whoever is nearby.

## Roadmapped

In order. A later item that depends on an earlier one says so.

## Side quests

Straightforward, likely to be done, not needed yet. Each is a thread cut from `main`.

* **One test container for every backend.** The Coach (2026-10-16): a big container serving
  Convex (its local backend), Postgres, and each backend added later, used by CI as a service
  container and by a contributor locally. It is what the race battery
  ([#119](https://github.com/mrflip/safebyok/pull/119)) cannot do in-process: Postgres's
  one-statement writes under concurrent connections (one `pg` pool per device) are reasoned in
  sprint matters' thread 11 (`winboard/20261015-matters/thread-11-postgres_verdict.md`), not
  tested, and Convex runs against `convex-test`, not a real deployment. Decide: one image or a
  compose file of services; whether `e2e/` owns it; which suites run against it in CI and which
  stay in-process so `pnpm justify` needs no Docker.
* **A schema snapshot test for `format`.** Ruled 2026-10-16
  ([#115](https://github.com/mrflip/safebyok/pull/115)): any change to what a stored record may
  hold -- a field, a shape, or a range a check accepts -- bumps `format`. A test renders each
  stored schema with Zod's own `toJSONSchema`, keyed by its `format` literal, and fails with
  "bump `format`" when a schema changes under the same literal, so a loosened check (`.min(1)`
  to `.min(0)`) cannot ship unmarked.

## Soonish

Wanted; each has a design question to settle first, named here.

### Which ways in a rotation keeps

From [#105](https://github.com/mrflip/safebyok/pull/105) (the rotation design, section 9). The
first matter said rotation "re-wraps the remaining envelopes", but it can't: each way in's key
comes from a passphrase or a passkey touch the vault never keeps, and any shortcut would hand the
new vaultKey to the way in being removed. So the design keeps only the ways in the user proves
during the rotation and removes the rest -- which is also what locks out a lost phone's passkey,
and signs every other device out until it is asked again. The alternative, a key pair per way in
so rotation can re-wrap every envelope unasked (HPKE), is a new construction (the design's open
question 1).

The Coach (2026-10-16): wants to understand this better; land the recommendation for now. **Landed
as recommended**: thread 19 (`rotateVaultKey`, not yet built) keeps only the ways in proven during
the rotation.
Revisit before 1.0 if rotation signing every other device out is too blunt.

### `destroy()`'s edge cases

From the Convex sprint ([#18](https://github.com/mrflip/safebyok/pull/18)): a handle that never
saw a bundle resolves `destroy()` without erasing, even if a vault has since appeared elsewhere, so
"delete account" can report success while a vault stands. And after a refused `destroy()`, an
app's automatic retry erases the vault that was made again in between. The Coach (2026-10-16):
assess these once the contract is tight and the tests unified -- that is, against
`packages/safebyok/VAULTDB.md` ([#107](https://github.com/mrflip/safebyok/pull/107)) and the
shared battery ([#114](https://github.com/mrflip/safebyok/pull/114)), after the Convex tests settle
in their home ([#111](https://github.com/mrflip/safebyok/pull/111)). First check whether big_feats
changed either.

### Lock NOW vs soft lock

From [#106](https://github.com/mrflip/safebyok/pull/106): a `read()` or `use()` that started
while the vault was unlocked still hands back its whisper if the vault locks (a sign-out, or
`lock()`) while it waits on storage. It has always been so for `lock()`; a sign-out makes it
likelier. The orchestrator proposed that reads check again after storage answers and refuse with
`vault_locked`.

The Coach (2026-10-16), holding it: there should be a distinction between *lock the phone, the
goons are here* and *it's time for a password refresh*. The proposal sounds like its own race
condition; decide what guarantee we offer, and why, before writing more code.

Where it stands today: the expiry ruling (*5. Expiry and the unlock window*, now in
`winboard/20261016-todo/20261016-todo-open.md`) says "in-flight work is never clawed back",
and `lockSoon()` already gives a grace in which work started before it finishes -- the soft lock.
`lock()` and a sign-out have no separate meaning yet. Decide: does `lock()` mean "now" (nothing
started before it hands back a whisper after it), and if so, is a re-check after storage enough,
or does the whisper's decryption also need to be refused once the key is gone?

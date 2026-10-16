---
'safebyok': minor
---

`safebyok/testing` gains four helpers. `expectRefusal(operation, kind)` checks that a call rejects with a `VaultError` of that `kind` and hands the error back for a closer look. `thrownText(err)` is everything a thrown value carries as one searchable text: message, stack, own properties, and every cause beneath. `leafTexts(record)` lists a record's string and number values, to search that text for. `omitting(bag, ckey)` is an options bag with one field left out, still typed as the whole bag, for a test that an entrypoint refuses a forgotten option without a cast.

`describeVaultDB` now checks its refusals with `expectRefusal`, so an adapter's refusal must be an instance of the package's `VaultError`, as well as carry the right `kind`. An adapter that throws the package's `VaultError`, as the VaultDB contract asks, passes as before; one that throws a plain `Error` with a `kind`, or a lookalike of its own, now fails those cases.

`tweakB64('')` now throws a `TypeError`: blank text has nothing to bend, and the `'a'` it used to return decodes to nothing. Text that is not blank is bent as before.

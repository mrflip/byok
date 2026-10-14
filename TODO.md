# TODO

## Soonish

Add the convex skill to the appropriate place, **scoped** to only that directory
(`packages/byok-convex/`), and with only the files likely to be relevant.

A pad/unpad helper, so a lockbox's ciphertext length stops telling the backend what kind of
whisper it holds (an API key from a PEM). Padding goes inside the encryption, by a published
scheme (PADMÉ, from the PURBs paper, or power-of-two buckets), not one of our own. To decide: does
it need a stored-format change, or can the padding be trailing JSON whitespace, which every
existing reader already ignores?

Use stable jsonify

export a treeshakeable byok/utils, with a function
`mask(whisper, { head = 2, tail = 4, minStars: 6, maxLen: 15 })`: it replaces all but the first `actualHead` and last `actualTail` characters with '*'; if length is less than minStars + tail + head, remove stars (first from head, then from tail). above maxLen, it will insert `'***...***'` between head and tail. Decide if the interface should be maxLen or maxStars. mask should, first, remove all control characters (including newline, cr or tab)

## NOT YET
Reasonable tasks that we do not plan to do in the near term. Do not anticipate them in your implementation.

* Recovery keys
* A blob helper, for secrets too large to be a whisper: a lockbox holds the key, and byok's own
  vetted, context-bound encryption seals the blob into a separate pluggable blob store (its own
  interface beside VaultDB), so no host app hand-rolls encryption with a key taken out of a vault.


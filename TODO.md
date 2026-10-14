# TODO

## Soonish

Add the convex skill to the appropriate place, **scoped** to only that directory
(`packages/byok-convex/`), and with only the files likely to be relevant.

Use stable jsonify

export a treeshakeable byok/utils, with a function
`mask(whisper, { head = 2, tail = 4, minStars: 6, maxLen: 15 })`: it replaces all but the first `actualHead` and last `actualTail` characters with '*'; if length is less than minStars + tail + head, remove stars (first from head, then from tail). above maxLen, it will insert `'***...***'` between head and tail. Decide if the interface should be maxLen or maxStars. mask should, first, remove all control characters (including newline, cr or tab)

## NOT YET
Reasonable tasks that we do not plan to do in the near term. Do not anticipate them in your implementation.

* Recovery keys


---
'safebyok': minor
---

Adds the `safebyok/utils` entry point with `mask(whisper, opts?)`, which gives a best-effort whiff of each end of a whisper (`sk***...***wxyz`) so a user can tell which API key a lockbox holds without revealing it. The result is always one plain line, safe to show in a log or a reminder: combining marks, invisible and control characters, bidirectional controls and direction marks, and spaces are stripped (right-to-left letters are kept, so a mask may reorder neighbouring neutral characters in a display), and the result is never longer than `maxLen` (15 by default; when `head`, `***...***` and `tail` do not fit, it is `maxLen` stars). It is not a faithful copy of the whisper's ends, and is intended for plain text. A new entry point only: nothing existing changes.

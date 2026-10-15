---
'safebyok': minor
---

Adds the `safebyok/utils` entry point with `mask(whisper, opts?)`, which shows which API key a lockbox holds without revealing it (`sk***...***wxyz`). It strips control, bidirectional and zero-width characters, never splits an emoji or an accented letter, always leaves at least `minStars` stars, and never returns more than `maxLen` characters (a `maxLen` below `head + tail + 9`, too small for a collapsed result, is refused). A new entry point only: nothing existing changes.

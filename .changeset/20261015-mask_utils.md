---
'safebyok': minor
---

Adds the `safebyok/utils` entry point with `mask(whisper, opts?)`, which shows which API key a lockbox holds without revealing it (`sk***...***wxyz`). It strips control characters, never splits an emoji or an accented letter, and always leaves at least `minStars` stars. A new entry point only: nothing existing changes.

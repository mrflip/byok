---
'safebyok': patch
---

A `vault.store()` that loses a race to another device now waits a random time before each retry, so two devices that collided do not collide again in step: 1 to 2 seconds before the first retry, 2 to 4 before the second. A store that keeps losing therefore takes up to about six seconds longer to throw `stale_write`. There is no wait before the first attempt, none after the last refusal, and none when the box was erased elsewhere or the device was relocked (those are thrown at once). A vault locked during the wait is refused as `vault_locked` when the store wakes, without writing. Nothing stored changes, and there is no new option.

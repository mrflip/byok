# safebyok-fastkey

## 0.4.0

### Minor Changes

- [#125](https://github.com/mrflip/safebyok/pull/125) [`161a6b1`](https://github.com/mrflip/safebyok/commit/161a6b17f9cf6d602c627712e22dc0edc453b2e0) Thanks [@mrflip](https://github.com/mrflip)! - Key derivers are checked harder, and a passkey can change a passphrase.
  
  **`KeyDeriver` is now a union** (breaking for a host's types; the reserved labels and the zeroed
  bytes below may break a host's own deriver too): `Argon2idKeyDeriver`
  (a whole `KeyDeriverSpec` beside `key_deriver_label`, `salt_bytes` and `deriveKeyBytes`: what
  `argon2idDeriver`, `argon2idWebV1Deriver` and `safebyok-fastkey`'s derivers return) or
  `CustomKeyDeriver` (those three fields, and optionally an `algorithm` of the host's naming).
  Every field keeps its name. What changes: an `Argon2idKeyDeriver` must carry every parameter
  of the spec (the union as a whole still admits a partial set, which `openVault` checks only on a
  deriver declaring `algorithm: 'argon2id'`), and a class can `implements
  CustomKeyDeriver` or `Argon2idKeyDeriver` but not `KeyDeriver` itself. `openVault` now runs
  the Argon2id spec check on any deriver declaring `algorithm: 'argon2id'`, so a spec Argon2id
  cannot run is refused at open (`bad_option`) rather than failing at the first unlock, and
  refuses a label beginning `argon2id_web_` (any case) that is not a spec safebyok supplies. A
  label beginning `test_` is warned of through the logger, not refused.
  
  * `changePassphrase(proof, newPassphrase, { unlockId? })` takes any way in as proof, a
    passkey's answer included. Given a passkey's answer on a vault of several passphrases, say
    which to replace with `unlockId` (`bad_option` otherwise). A passphrase proof behaves as before.
  * The vault zeroes the bytes a deriver hands back once imported, so a deriver must return a
    fresh array each call, and refuses (`bad_option`) bytes in a `SharedArrayBuffer`.
  * `argon2idDeriver`, `argon2idWebV1Deriver` and `argon2idWasmDeriver` refuse a salt of another
    length than the spec's (`bad_option`) before deriving. `ensureSaltFits` is exported for a
    deriver of another implementation to do the same.
  * `parseKeyDeriverSpec` now lives in the spec module and refuses the reserved labels too.
  * A `wrong_passphrase` beside passphrases made by another key deriver says how many went
    untried, and that opening the vault where it was made may help.
  * `UnlockSummary` (the snapshot's `unlocks`) gains `device_id` and `registered_at`.
  * New exports: `Argon2idKeyDeriver`, `CustomKeyDeriver`, `ensureSaltFits`.
  * `Envelope.sealPassphrase` and `sealPasskey` (internal) return the envelope alone.

### Patch Changes

- Updated dependencies [[`c3127d9`](https://github.com/mrflip/safebyok/commit/c3127d9c8020524458cbc065bfa98cbbeb23fa50), [`161a6b1`](https://github.com/mrflip/safebyok/commit/161a6b17f9cf6d602c627712e22dc0edc453b2e0), [`80673f9`](https://github.com/mrflip/safebyok/commit/80673f9d073f592b111a9144df1a3eb26e394e6c), [`e25bf68`](https://github.com/mrflip/safebyok/commit/e25bf6885b6f42cc621a3d4108c2fc007da5c79f), [`6f037b4`](https://github.com/mrflip/safebyok/commit/6f037b43bcf3c7041280b6fa9966551ec85227f7), [`443e7f6`](https://github.com/mrflip/safebyok/commit/443e7f68ab088fb290c62a37712c44d6bd67f18d), [`91f22ee`](https://github.com/mrflip/safebyok/commit/91f22eed2628d7cf7fbbf526e07f1f9523d77f96), [`3cf065c`](https://github.com/mrflip/safebyok/commit/3cf065cc528d43447b3f439a3a37f4c81de36190), [`abbe79c`](https://github.com/mrflip/safebyok/commit/abbe79c79725ab4592ebc5c6bfbac1a8a6bdeb33), [`0b99b51`](https://github.com/mrflip/safebyok/commit/0b99b517f71318718d87e2d459dc5090f5d2674c), [`47b156b`](https://github.com/mrflip/safebyok/commit/47b156b6fcd301de73771677b42b680c096708bc), [`91afb90`](https://github.com/mrflip/safebyok/commit/91afb90fe9a075dfb753204b141e16acb6ad92b4), [`af18f4d`](https://github.com/mrflip/safebyok/commit/af18f4d90a0aae83a1abfdc4c6acac1260771afa), [`bcd69a9`](https://github.com/mrflip/safebyok/commit/bcd69a9437b4a69a98db242d974f1e058cb1f698), [`d1b8f08`](https://github.com/mrflip/safebyok/commit/d1b8f0824a4333d164190c78d178244b17bd926f)]:
  - safebyok@0.4.0

## 0.3.0

### Minor Changes

- [#79](https://github.com/mrflip/safebyok/pull/79) [`19fb0bb`](https://github.com/mrflip/safebyok/commit/19fb0bbbba2f80f589181cb5ed2440733d07b8f3) Thanks [@mrflip](https://github.com/mrflip)! - New package, `safebyok-fastkey`: Argon2id through WebAssembly (`hash-wasm`) as a safebyok KeyDeriver, about four times faster than the core's `@noble/hashes` deriver and deriving the same bytes. `argon2idWasmWebV1Deriver` stands in for `argon2idWebV1Deriver` under the same `argon2id_web_v1` label, so a vault made under either opens under the other; `argon2idWasmDeriver(spec)` runs a spec of the host's own. It needs WebAssembly (not React Native's Hermes) and, in a page with a Content-Security-Policy, `'wasm-unsafe-eval'`.
  
  The core exports `parseKeyDeriverSpec(spec)`, the check `argon2idDeriver` makes of a spec, for a deriver over another Argon2id implementation to make the same. Its refusal now begins "Argon2id cannot run that keyDeriverSpec" where it named `argon2idDeriver`. Nothing stored changes.

### Patch Changes

- Updated dependencies [[`19fb0bb`](https://github.com/mrflip/safebyok/commit/19fb0bbbba2f80f589181cb5ed2440733d07b8f3), [`d7f2146`](https://github.com/mrflip/safebyok/commit/d7f21462c200c0481b92002eb01f672a3a19eacd), [`b5bd848`](https://github.com/mrflip/safebyok/commit/b5bd8486cd8a994ea8932ea82518b46046290dae), [`8bdac52`](https://github.com/mrflip/safebyok/commit/8bdac521cc632ba18301e11e080e30e3dc808670), [`4cdb7a6`](https://github.com/mrflip/safebyok/commit/4cdb7a66122cb8428dae15043b5dc0f65922cf40), [`e5a1042`](https://github.com/mrflip/safebyok/commit/e5a104287c74f080dce93bc3e36047951994c639), [`648b2c4`](https://github.com/mrflip/safebyok/commit/648b2c4fe365bf40bb115b34c57b1d5976524431), [`fa98f80`](https://github.com/mrflip/safebyok/commit/fa98f803941461a7a91ee99b79cba02591aff801), [`7663693`](https://github.com/mrflip/safebyok/commit/7663693da56eee7c098550cb7e597b138e73ea84), [`d6d278a`](https://github.com/mrflip/safebyok/commit/d6d278a939454b4139c91456ba3e54a263e7922e), [`7ed3e7c`](https://github.com/mrflip/safebyok/commit/7ed3e7c2945830385549347a78a7bbc2948e62f8), [`08a5e29`](https://github.com/mrflip/safebyok/commit/08a5e29f531ca7ac8a6f7aa0f8e8e9d53a5b7bb7), [`4c20512`](https://github.com/mrflip/safebyok/commit/4c205126c9949ea191bf2369b83c637220cf64df), [`d413355`](https://github.com/mrflip/safebyok/commit/d4133555449de0d0b883a35eb020cbcea2ae04d1), [`6100763`](https://github.com/mrflip/safebyok/commit/6100763390de40c42c5fa869ca9599648d1508c5), [`96c13d6`](https://github.com/mrflip/safebyok/commit/96c13d678301d6a9c263a907e0a510db30cfb539), [`c79d0ab`](https://github.com/mrflip/safebyok/commit/c79d0abff8391e0afc0dc9b3fa23b4e0b1c58eff), [`ca17a89`](https://github.com/mrflip/safebyok/commit/ca17a899dadd3ba40bce0b12d6e75af35c2f1fc9), [`e460fa6`](https://github.com/mrflip/safebyok/commit/e460fa66078505f306f1c7fddf5b1f7d5d4bccd1), [`f09d5a1`](https://github.com/mrflip/safebyok/commit/f09d5a14713bd1981ef6b1f6caa8bdc76d677b85), [`53b1f1a`](https://github.com/mrflip/safebyok/commit/53b1f1aabea16102dc7bfb6187410369e05b2e53), [`c2cd449`](https://github.com/mrflip/safebyok/commit/c2cd4493e99a8344af1d73f3a2a5ede66b8075b9), [`da114b8`](https://github.com/mrflip/safebyok/commit/da114b8870382536a0d66a2d7220fdb5fbba38a9), [`14f185c`](https://github.com/mrflip/safebyok/commit/14f185c2e9dac79ea486696166fcdf87d64c77e1), [`4988661`](https://github.com/mrflip/safebyok/commit/49886618f5fed0cdd41d00992bb0897dcdccf014), [`ce13ac7`](https://github.com/mrflip/safebyok/commit/ce13ac7c3615e83d1dabb76e3144932bfe9b1cbc), [`b49c1f4`](https://github.com/mrflip/safebyok/commit/b49c1f406d0c40521f0e1740e6221f2309c9e882), [`2edd8d1`](https://github.com/mrflip/safebyok/commit/2edd8d19b198a4b430699c257efe90bef5306f8c), [`e4a7bd5`](https://github.com/mrflip/safebyok/commit/e4a7bd55d353584eee998ea69195519509be0e34), [`dbf0068`](https://github.com/mrflip/safebyok/commit/dbf0068d50d52d1941b8203f8cc78abdcba80356), [`9c052c4`](https://github.com/mrflip/safebyok/commit/9c052c4c7aacf3f8559ad0945122e4222719466b), [`3b1cc9c`](https://github.com/mrflip/safebyok/commit/3b1cc9cba27d1fea66fadf8cbb8c288eae095ff8), [`771f841`](https://github.com/mrflip/safebyok/commit/771f8417336c3067cba38e4913d06a395972d17a), [`3304864`](https://github.com/mrflip/safebyok/commit/3304864f594995dad682d1048059e3b22f1c8dc6), [`4ab25a6`](https://github.com/mrflip/safebyok/commit/4ab25a66de91e7ba05c618912da0c7309077ba2a), [`18a960b`](https://github.com/mrflip/safebyok/commit/18a960b5ff9d240643bf05e5a166d95d3a1d70fb), [`6acb67d`](https://github.com/mrflip/safebyok/commit/6acb67d28e995f0b47a1c0950b241d0c81693571), [`39a76ca`](https://github.com/mrflip/safebyok/commit/39a76cae91630ac9bc05f9cdf5646f65d3673981), [`8dd473b`](https://github.com/mrflip/safebyok/commit/8dd473b333ffeffaaf63eceb64b1b32938362e13), [`ac5ea2e`](https://github.com/mrflip/safebyok/commit/ac5ea2e94137587ec28bbb4a06dd6597555ae0d6), [`cbbcd44`](https://github.com/mrflip/safebyok/commit/cbbcd44ffbdc71a0eca86f106b74e62d7090b16c)]:
  - safebyok@0.3.0

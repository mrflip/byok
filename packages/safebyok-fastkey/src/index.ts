/**
 * safebyok-fastkey's public surface: Argon2id through WebAssembly (hash-wasm), as a safebyok
 * KeyDeriver. It wears the same keyDeriverSpecs as the core's pure-JavaScript deriver and derives
 * the same bytes, several times faster, wherever WebAssembly runs.
 */
export { argon2idWasmDeriver, argon2idWasmWebV1Deriver } from './wasm-deriver'

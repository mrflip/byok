import stringify from 'safe-stable-stringify'

/**
 * JSON text for `val` with every object's keys sorted, so two structurally equal values always
 * serialize to the same string regardless of the order their fields were assigned in. Arrays keep
 * their order; `undefined` comes back as `undefined`, as JSON.stringify would answer.
 *
 * A thin alias of safe-stable-stringify. Keys sort by code point, deliberately locale-independent:
 * equal values must serialize identically on every device.
 *
 * @example stableJsonify({ two: 2, one: 1 })  // '{"one":1,"two":2}'
 * @example stableJsonify([{ b: 1, a: 2 }])    // '[{"a":2,"b":1}]'
 */
export const stableJsonify = (val: unknown): string | undefined => stringify(val)

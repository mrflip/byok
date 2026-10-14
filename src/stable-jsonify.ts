/**
 * JSON text for `val` with every object's keys sorted, so two structurally equal values always
 * serialize to the same string regardless of the order their fields were assigned in. Arrays keep
 * their order; everything else behaves as JSON.stringify does.
 *
 * Hand-rolled (twelve lines) rather than a dependency: cheap to read, no supply-chain surface.
 *
 * @example stableJsonify({ two: 2, one: 1 })  // '{"one":1,"two":2}'
 * @example stableJsonify([{ b: 1, a: 2 }])    // '[{"a":2,"b":1}]'
 */
export const stableJsonify = (val: unknown): string => JSON.stringify(sortBagKeys(val))

const sortBagKeys = (val: unknown): unknown => {
  if (Array.isArray(val)) { return val.map((item) => sortBagKeys(item)) }
  if (val !== null && typeof val === 'object' && Object.getPrototypeOf(val) === Object.prototype) {
    const bag = val as Record<string, unknown>
    // Keys sort by code point, deliberately locale-independent: equal values must serialize
    // identically on every device, which localeCompare does not guarantee.
    // eslint-disable-next-line unicorn/require-array-sort-compare, sonarjs/no-alphabetical-sort
    const sortedCkeys = Object.keys(bag).toSorted()
    return Object.fromEntries(sortedCkeys.map((ckey) => [ckey, sortBagKeys(bag[ckey])]))
  }
  return val
}

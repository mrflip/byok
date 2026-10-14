/**
 * A branch label made from loose words: what `newb --from` runs its arguments through, so a
 * branch can be named from a title, a sentence, or another branch's name.
 *
 * The words are joined with a space and a leading datestamp (`20260928-`) comes off; what remains
 * is deburred, lowercased, and every run of whitespace, punctuation and underscore collapsed to a
 * single underscore, with none left at either end. Prints the label, or an empty line when no
 * label is left.
 *
 *   node scripts/newb-label.ts 20260928-++9FOO bar !!baz   # => z9foo_bar_baz
 */
import { deburr } from 'es-toolkit'

/** A label's shape: lowercase letters, digits and single underscores, a letter first, a letter or digit last */
export const Label = { re: /^[a-z](_?[a-z0-9])+$/, min: 2, max: 40 } as const

/**
 * `words` made into a branch label.
 *
 * @param words - The arguments following `--from`, as the shell split them.
 * @returns A valid label, or `''` when nothing label-worthy was given.
 *
 * @example branchLabel(['20260928-++9FOO', 'bar', '!!baz'])  // => 'z9foo_bar_baz'
 */
export function branchLabel(words: readonly string[]): string {
  return normalize(words.join(' ').replace(/^20\d{6}-/, ''))
}

/**
 * `str` squeezed into a label: deburred, lowercased, with every run of whitespace, punctuation
 * and underscore collapsed to a single underscore and none left at either end. Repaired
 * afterward so it starts with a letter and is `Label.min` to `Label.max` characters long.
 *
 * @param str - Loose words; a blank string gives no label.
 * @returns A string matching `Label.re`, or `''` when `str` was blank.
 *
 * @example normalize('Hello, World!')  // => 'hello_world'
 * @example normalize('  ')            // => ''
 */
export function normalize(str: string): string {
  if (str.trim() === '') { return '' }
  const cleaned = deburr(str).toLowerCase().replaceAll(/[\W_]+/g, '_').replaceAll(/^_|_$/g, '')
  const lettered = /^[a-z]/.test(cleaned) ? cleaned : `z${cleaned}`
  const label = lettered.slice(0, Label.max).replace(/_$/, '').padEnd(Label.min, 'z')
  if (! Label.re.test(label)) { throw new Error(`"${label}" is not label-shaped`) }
  return label
}

if (import.meta.main) {
  process.stdout.write(`${branchLabel(process.argv.slice(2))}\n`)
}

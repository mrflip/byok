import * as Z from 'zod'
import { VaultError } from './errors'

/** How `mask` shows a whisper: how many characters to reveal, and how many stars to hide it behind. */
export interface MaskOpts {
  /** Characters kept from the start of the whisper. Default 2. */
  head?: number | undefined
  /** Characters kept from the end of the whisper. Default 4. */
  tail?: number | undefined
  /** Fewest stars the result may carry, however short the whisper. Default 6. */
  minStars?: number | undefined
  /**
   * Longest result, in characters (code points). A longer one collapses to `head`, `***...***`,
   * `tail`; if even that is too long, to `maxLen` stars alone. Default 15. `Infinity` never collapses.
   */
  maxLen?: number | undefined
}

/** The stars-and-dots a masked whisper collapses to once the result would pass `maxLen`. */
const Collapsed = '***...***'

const wholeCount = Z.number().int().nonnegative()
const maskOpts = Z.object({
  head:     wholeCount.default(2),
  tail:     wholeCount.default(4),
  minStars: wholeCount.default(6),
  maxLen:   Z.union([Z.literal(Infinity), wholeCount]).default(15),
})

const parseMaskOpts = (candidate: MaskOpts | undefined): Record<keyof MaskOpts, number> => {
  const checked = maskOpts.safeParse(candidate ?? {})
  if (! checked.success) {
    throw new VaultError('bad_option', 'mask takes head, tail, minStars and maxLen as whole numbers of characters, none below zero (maxLen may be Infinity).')
  }
  return checked.data
}

/**
 * Everything `plainLine` removes: combining marks, every control, format, surrogate, private-use
 * and unassigned code point, every space and line or paragraph separator, anything a renderer is
 * told to ignore, the bidirectional controls, and the blank braille pattern.
 */
const Unsafe = /[\p{M}\p{C}\p{Z}\p{Default_Ignorable_Code_Point}\p{Bidi_Control}\u{2800}]/gu

/**
 * `text` reduced to one compact, safe line: composed (so a letter and its accent are one letter),
 * then stripped, never escaped, of every combining mark (stacked "Zalgo" marks among them),
 * invisible or control character, lone surrogate, bidirectional control and space of any kind.
 * Whatever is left is visible, takes one column's room per character and cannot reorder or
 * overwrite its neighbours. Letters of right-to-left scripts stay: they are text, and the
 * controls that would make them a hazard are gone.
 */
const plainLine = (text: string): string => text.normalize('NFC').replaceAll(Unsafe, '')

/** `text` as a list of its code points, so that a surrogate pair is never parted. */
const codePointsOf = (text: string): string[] => text.match(/./gsu) ?? []

/**
 * A whisper's outline, to show in a log or a reminder: a whiff of interesting text from each end
 * with stars between, so a user can tell which API key a lockbox holds without the key being
 * revealed. It is best effort, not a copy: the result is always one plain line, and fidelity
 * gives way to that. Combining marks (so, the accents of scripts that rely on them), invisible
 * characters and every kind of space are dropped from the whisper first, and the result is
 * cleaned the same way once more before it is returned. The result is public: show it, but
 * never count on it to hide more than it does -- it gives away the whisper's ends, and (up to
 * `maxLen`) its length.
 *
 * What is cut is cut by code point, so a cut can part an emoji sequence or a flag; whatever that
 * leaves is visible text. At least `minStars` stars always stand in the whisper's place: a
 * whisper too short to keep `head` and `tail` and still hide `minStars` characters gives up
 * `head` characters first, then `tail`, and one shorter than `minStars` shows only stars. A
 * result that would pass `maxLen` characters is instead the `head` kept, `***...***`, then the
 * `tail` kept; if that is too long too, it is `maxLen` stars, nothing else. Whatever the
 * options, the result is never longer than `maxLen`. An empty whisper gives the empty string; a
 * whisper that is nothing but removed characters gives `minStars` stars.
 *
 * Pass `{ head: 0, tail: 0 }` to show nothing of the whisper but how long it is. Lower `minStars`
 * with care: at 0 a short whisper may be shown whole.
 *
 * @param whisper - Text to mask: an API key, say.
 * @param opts - How much to keep and hide; see {@link MaskOpts}.
 * @returns The masked text. Throws a VaultError of kind 'bad_option' for an option that is not a
 *   whole number of at least zero, or 'bad_whisper' for a whisper that is not a string; neither
 *   message quotes the whisper.
 *
 * @example mask('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')  // 'sk***...***wxyz'
 * @example mask('sk-ant-abcd1234')                          // 'sk*********1234'
 * @example mask('sk-1234abcd')                              // 's******abcd'
 * @example mask('sk-123abcd')                               // '******abcd'
 * @example mask('abc')                                      // '******'
 * @example mask('sk-1234abcd', { head: 0, tail: 0 })        // '***********'
 * @example mask('sk-\nant-\tabcd1234')                      // 'sk*********1234'
 * @example mask('sk-ant-abcd1234xyz', { maxLen: 8 })        // '********'
 */
export const mask = (whisper: string, opts?: MaskOpts): string => {
  if (typeof whisper !== 'string') {
    throw new VaultError('bad_whisper', 'mask masks a whisper that is a string.')
  }
  const { head, tail, minStars, maxLen } = parseMaskOpts(opts)
  if (whisper === '') { return '' }
  const chars = codePointsOf(plainLine(whisper))

  // What may be shown at all is what is left once minStars are hidden: tail has first call on it.
  const showable = Math.max(0, chars.length - minStars)
  const tailShown = Math.min(tail, showable)
  const headShown = Math.min(head, showable - tailShown)
  const stars = Math.max(minStars, chars.length - headShown - tailShown)

  const headChars = chars.slice(0, headShown).join('')
  const tailChars = tailShown > 0 ? chars.slice(-tailShown).join('') : ''
  // Lengths are compared before anything is built, so a vast minStars costs nothing it would discard.
  const fitting = (): string => {
    if (headShown + stars + tailShown <= maxLen) { return headChars + '*'.repeat(stars) + tailChars }
    if (headShown + Collapsed.length + tailShown <= maxLen) { return headChars + Collapsed + tailChars }
    return '*'.repeat(maxLen)
  }
  return plainLine(fitting())
}

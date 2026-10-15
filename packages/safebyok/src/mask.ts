import * as Z from 'zod'
import { VaultError } from './errors'

/** How `mask` shows a whisper: how many characters to reveal, and how many stars to hide it behind. */
export interface MaskOpts {
  /** Characters kept from the start of the whisper. Default 2. */
  head?: number
  /** Characters kept from the end of the whisper. Default 4. */
  tail?: number
  /** Fewest stars the result may carry, however short the whisper. Default 6. */
  minStars?: number
  /** Longest result worth showing, in characters; longer collapses to `***...***`. Default 15. `Infinity` never collapses. */
  maxLen?: number
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

const parseMaskOpts = (candidate: MaskOpts | undefined): Required<MaskOpts> => {
  const checked = maskOpts.safeParse(candidate ?? {})
  if (! checked.success) {
    throw new VaultError('bad_option', 'mask takes head, tail and minStars as whole numbers of characters, and maxLen as a whole number or Infinity, none below zero.')
  }
  return checked.data
}

/**
 * The user-perceived characters of `text` (an emoji, or a letter with its combining accent, is
 * one), so that masking never cuts one in half. Falls back to code points on a runtime without
 * `Intl.Segmenter`.
 */
const charsOf = (text: string): string[] => {
  if (typeof Intl.Segmenter !== 'function') { return text.match(/./gsu) ?? [] }
  return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (part) => part.segment)
}

/** Control characters (newline, return and tab among them) and the line and paragraph separators. */
const Unprintable = /[\p{Cc}\p{Zl}\p{Zp}]/gu

/**
 * A whisper's outline, safe to show: its first and last few characters with stars between, so a
 * user can tell which API key a lockbox holds without the key being revealed. The result is
 * public: show it, but never count on it to hide more than it does -- it gives away the whisper's
 * ends, and (below `maxLen`) its length.
 *
 * Control characters are removed first. A character is a user-perceived one, so an emoji or an
 * accented letter is never split. At least `minStars` stars always stand in the whisper's place:
 * a whisper too short to keep `head` and `tail` and still hide `minStars` characters gives up
 * `head` characters first, then `tail`, and one shorter than `minStars` shows only stars. A
 * result that would pass `maxLen` characters is instead the `head`, `***...***`, then the `tail`
 * (so `maxLen` wins over `minStars`, if they disagree). A whisper with nothing left to show gives
 * the empty string.
 *
 * Pass `{ head: 0, tail: 0 }` to show nothing of the whisper but how long it is. Lower `minStars`
 * with care: at 0 a short whisper may be shown whole.
 *
 * @param whisper - Text to mask: an API key, say.
 * @param opts - How much to keep and hide; see {@link MaskOpts}.
 * @returns The masked text. Throws a VaultError of kind 'bad_option' for an option out of range, or
 *   'bad_whisper' for a whisper that is not a string; neither message quotes the whisper.
 *
 * @example mask('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')  // 'sk***...***wxyz'
 * @example mask('sk-ant-abcd1234')                          // 'sk*********1234'
 * @example mask('sk-1234abcd')                              // 's******abcd'
 * @example mask('sk-123abcd')                               // '******abcd'
 * @example mask('abc')                                      // '******'
 * @example mask('sk-1234abcd', { head: 0, tail: 0 })        // '***********'
 * @example mask('sk-\nant-\tabcd1234')                      // 'sk*********1234'
 */
export const mask = (whisper: string, opts?: MaskOpts): string => {
  if (typeof whisper !== 'string') {
    throw new VaultError('bad_whisper', 'mask masks a whisper that is a string.')
  }
  const { head, tail, minStars, maxLen } = parseMaskOpts(opts)
  const chars = charsOf(whisper.replaceAll(Unprintable, ''))
  if (chars.length === 0) { return '' }

  // What may be shown at all is what is left once minStars are hidden: tail has first call on it.
  const showable = Math.max(0, chars.length - minStars)
  const tailShown = Math.min(tail, showable)
  const headShown = Math.min(head, showable - tailShown)
  const stars = Math.max(minStars, chars.length - headShown - tailShown)

  const headChars = chars.slice(0, headShown).join('')
  const tailChars = tailShown > 0 ? chars.slice(-tailShown).join('') : ''
  const outLen = headShown + stars + tailShown
  return headChars + (outLen > maxLen ? Collapsed : '*'.repeat(stars)) + tailChars
}

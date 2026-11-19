import { LANDING_FONT } from "./tokens"

/**
 * Fit table for the landing motto (`components/landing/hero-motto.tsx`): six words, six typefaces.
 * Every size here is in container-query units (cqw), so the poster scales as one object.
 */

export interface MottoFont {
  id: string
  family: string
  weight: number
  italic?: boolean
  upper?: boolean
  tracking?: string
  /**
   * Measured advance of each motto word in em, in WORDS order, at this face's weight and style.
   * Lets any face fill the same slot, so no word outgrows its width through a shuffle.
   * Re-measure if the motto, a weight, or a tracking value changes.
   */
  widths: [number, number, number, number, number, number]
}

export const FONTS: MottoFont[] = [
  { id: "bebas", family: LANDING_FONT.bebas, weight: 400, upper: true, widths: [4.39, 1.19, 1.94, 1.56, 1.35, 3.53] },
  {
    id: "playfair",
    family: LANDING_FONT.playfairItalic,
    weight: 900,
    italic: true,
    widths: [6.49, 1.62, 2.63, 2.19, 1.74, 4.96],
  },
  { id: "roboto", family: LANDING_FONT.roboto, weight: 700, widths: [6.27, 1.61, 2.5, 2.2, 1.68, 4.75] },
  { id: "merriweather", family: LANDING_FONT.merriweather, weight: 700, widths: [6.93, 1.75, 2.8, 2.4, 1.92, 5.24] },
  {
    id: "source",
    family: LANDING_FONT.sourceItalic,
    weight: 900,
    italic: true,
    widths: [6.77, 1.75, 2.77, 2.29, 1.84, 5.3],
  },
  {
    id: "inter",
    family: LANDING_FONT.inter,
    weight: 600,
    tracking: "-0.045em",
    widths: [6.23, 1.6, 2.52, 2.24, 1.6, 4.69],
  },
  { id: "mono", family: LANDING_FONT.mono, weight: 600, widths: [6.6, 1.8, 3, 2.4, 2.4, 6] },
  { id: "lora", family: LANDING_FONT.lora, weight: 700, widths: [6.67, 1.63, 2.72, 2.29, 1.85, 4.96] },
  { id: "outfit", family: LANDING_FONT.outfit, weight: 700, widths: [6.26, 1.63, 2.63, 2.26, 1.69, 4.91] },
  { id: "raleway", family: LANDING_FONT.raleway, weight: 700, widths: [6.6, 1.67, 2.71, 2.44, 1.74, 5.01] },
]

const FONT_BY_ID = new Map(FONTS.map((font) => [font.id, font]))

export function mottoFont(id: string): MottoFont {
  return FONT_BY_ID.get(id) ?? FONTS[0]
}

export interface MottoWord {
  text: string
  line: 0 | 1 | 2
  /** Target rendered width in cqw. */
  width: number
  /** Font-size ceiling in cqw. */
  max: number
  font: string
  /** Where the word sits before the page is organized. */
  mess: string
}

export const WORDS: MottoWord[] = [
  { text: "Consumerism", line: 0, width: 63, max: 15, font: "bebas", mess: "translate(-2cqw, 6cqw) rotate(-8deg)" },
  { text: "has", line: 0, width: 16, max: 12, font: "playfair", mess: "translate(5cqw, -3cqw) rotate(16deg)" },
  { text: "never", line: 1, width: 31, max: 12, font: "roboto", mess: "translate(-7cqw, 2cqw) rotate(10deg)" },
  { text: "been", line: 1, width: 26, max: 11, font: "merriweather", mess: "translate(3cqw, 5cqw) rotate(-13deg)" },
  { text: "this", line: 1, width: 19, max: 12, font: "source", mess: "translate(4cqw, -4cqw) rotate(19deg)" },
  { text: "organized.", line: 2, width: 84, max: 17.5, font: "inter", mess: "translate(2cqw, 3cqw) rotate(-5deg)" },
]

export const DEFAULT_FONT_IDS = WORDS.map((word) => word.font)

/** Space between two words on a line, in cqw. */
export const WORD_GAP = 3

const round2 = (value: number) => Math.round(value * 100) / 100

/** The size that makes `word` fill its target width in `font`, capped at the word's ceiling. */
export function fontSizeCqw(word: MottoWord, index: number, font: MottoFont): number {
  return round2(Math.min(word.max, word.width / font.widths[index]))
}

/** Line height as a multiple of the largest size a line can be set in. */
export const LINE_LEADING = 0.9
/** How far below a line's top its baseline sits, as a multiple of that same size. */
export const LINE_BASELINE = 0.75

export interface MottoLine {
  /** Fixed height in cqw. */
  height: number
  /** Baseline offset from the line's top in cqw. */
  baseline: number
}

/**
 * Each line's box comes from the largest size any of its words can reach, never from the faces
 * currently assigned, so a shuffle cannot change the poster's height or move a baseline.
 */
export const LINES: MottoLine[] = ([0, 1, 2] as const).map((line) => {
  const largest = Math.max(...WORDS.filter((word) => word.line === line).map((word) => word.max))
  return { height: largest * LINE_LEADING, baseline: largest * LINE_BASELINE }
})

/** A random assignment of distinct faces to the six words, never the one already showing. */
export function pickFonts(current: string[], random: () => number = Math.random): string[] {
  const pool = [...FONTS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const next = pool.slice(0, WORDS.length).map((font) => font.id)
  // A shuffle that changes nothing reads as a broken button.
  return next.every((id, i) => id === current[i]) ? [...next.slice(1), next[0]] : next
}

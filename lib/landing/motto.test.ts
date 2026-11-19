import { describe, expect, it } from "vitest"
import {
  DEFAULT_FONT_IDS,
  FONTS,
  fontSizeCqw,
  LINE_BASELINE,
  LINE_LEADING,
  LINES,
  mottoFont,
  pickFonts,
  WORD_GAP,
  WORDS,
} from "./motto"

/** Deterministic stand-in for Math.random. */
function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}

const lineWords = (line: number) => WORDS.filter((word) => word.line === line)

describe("fontSizeCqw", () => {
  it("never exceeds the word's ceiling, in any face", () => {
    WORDS.forEach((word, index) => {
      for (const font of FONTS) {
        expect(fontSizeCqw(word, index, font)).toBeLessThanOrEqual(word.max)
      }
    })
  })

  it("never sets a word wider than its target width, in any face", () => {
    WORDS.forEach((word, index) => {
      for (const font of FONTS) {
        const rendered = fontSizeCqw(word, index, font) * font.widths[index]
        // Sizes are rounded to 0.01cqw, so allow that one step of size.
        expect(rendered).toBeLessThan(word.width + 0.01 * font.widths[index])
      }
    })
  })

  it("fills the target width when the ceiling is not hit", () => {
    const consumerism = WORDS[0]
    const playfair = mottoFont("playfair")
    expect(fontSizeCqw(consumerism, 0, playfair)).toBeCloseTo(consumerism.width / playfair.widths[0], 2)
  })
})

describe("lines", () => {
  it("fit the poster at their widest, gaps included", () => {
    for (const line of [0, 1, 2]) {
      const words = lineWords(line)
      const widest = words.reduce((sum, word) => sum + word.width, 0) + WORD_GAP * (words.length - 1)
      expect(widest).toBeLessThanOrEqual(100)
    }
  })

  it("have a height set by the largest size the line can reach, not by the faces in use", () => {
    LINES.forEach((box, line) => {
      const largest = Math.max(...lineWords(line).map((word) => word.max))
      expect(box.height).toBeCloseTo(largest * LINE_LEADING, 2)
      expect(box.baseline).toBeCloseTo(largest * LINE_BASELINE, 2)
      expect(box.baseline).toBeLessThan(box.height)
    })
  })

  it("are tall enough for every word in every face", () => {
    WORDS.forEach((word, index) => {
      for (const font of FONTS) {
        expect(fontSizeCqw(word, index, font) * LINE_LEADING).toBeLessThanOrEqual(LINES[word.line].height)
      }
    })
  })
})

describe("pickFonts", () => {
  it("never repeats a face and only uses known faces", () => {
    const random = seeded(7)
    let current = DEFAULT_FONT_IDS
    for (let i = 0; i < 500; i++) {
      const next = pickFonts(current, random)
      expect(next).toHaveLength(WORDS.length)
      expect(new Set(next).size).toBe(WORDS.length)
      expect(next.every((id) => FONTS.some((font) => font.id === id))).toBe(true)
      current = next
    }
  })

  it("never returns the assignment already showing", () => {
    const random = seeded(11)
    let current = DEFAULT_FONT_IDS
    for (let i = 0; i < 500; i++) {
      const next = pickFonts(current, random)
      expect(next).not.toEqual(current)
      current = next
    }
  })

  it("rotates when the shuffle lands on the current assignment", () => {
    // A roll just under 1 swaps every entry with itself, which leaves the default order in place.
    const unchanged = FONTS.slice(0, WORDS.length).map((font) => font.id)
    expect(unchanged).toEqual(DEFAULT_FONT_IDS)
    const next = pickFonts(DEFAULT_FONT_IDS, () => 0.999999)
    expect(next).toEqual([...DEFAULT_FONT_IDS.slice(1), DEFAULT_FONT_IDS[0]])
  })
})

describe("mottoFont", () => {
  it("falls back to the first face for an unknown id", () => {
    expect(mottoFont("nope")).toBe(FONTS[0])
  })
})

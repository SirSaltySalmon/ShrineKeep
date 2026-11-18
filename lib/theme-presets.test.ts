import { describe, expect, it } from "vitest"
import { COLOR_SCHEME_PRESETS, detectThemePreset, resolveThemePreset, type ThemePreset } from "./settings"
import { THEME_COLOR_KEYS } from "./theme-colors"
import { DEFAULT_BODY_FONT_FAMILY, DEFAULT_HEADER_FONT_FAMILY, FONT_OPTIONS } from "./fonts"

const HSL_TRIPLE = /^\d+\.?\d*\s+\d+\.?\d*%\s+\d+\.?\d*%$/
const RADIUS_OPTIONS = ["0", "0.25rem", "0.5rem", "0.75rem"]
const FONT_IDS = FONT_OPTIONS.map((option) => option.value as string)
const PRESETS = Object.keys(COLOR_SCHEME_PRESETS) as ThemePreset[]

describe("theme presets", () => {
  it.each(PRESETS)("%s defines every theme color as an HSL triple", (preset) => {
    const { scheme } = resolveThemePreset(preset)
    for (const key of THEME_COLOR_KEYS) {
      expect(scheme[key], `${preset}.${key}`).toMatch(HSL_TRIPLE)
    }
  })

  it.each(PRESETS)("%s resolves to a radius and fonts the theme editor offers", (preset) => {
    const resolved = resolveThemePreset(preset)
    expect(RADIUS_OPTIONS).toContain(resolved.scheme.radius)
    expect(FONT_IDS).toContain(resolved.headerFontFamily)
    expect(FONT_IDS).toContain(resolved.bodyFontFamily)
  })

  it("keeps the original presets on default fonts and medium corners", () => {
    for (const preset of ["light", "dark", "pink"] as const) {
      const resolved = resolveThemePreset(preset)
      expect(resolved.headerFontFamily).toBe(DEFAULT_HEADER_FONT_FAMILY)
      expect(resolved.bodyFontFamily).toBe(DEFAULT_BODY_FONT_FAMILY)
      expect(resolved.scheme.radius).toBe("0.5rem")
    }
  })

  it("gives Matcha and Arcade their own fonts and corners", () => {
    expect(resolveThemePreset("matcha")).toMatchObject({
      headerFontFamily: "Lora",
      bodyFontFamily: "Figtree",
      scheme: { radius: "0.25rem" },
    })
    expect(resolveThemePreset("arcade")).toMatchObject({
      headerFontFamily: "JetBrains Mono",
      bodyFontFamily: "JetBrains Mono",
      scheme: { radius: "0" },
    })
  })

  it("does not hand out the shared preset object", () => {
    const first = resolveThemePreset("matcha").scheme
    first.background = "0 0% 0%"
    expect(resolveThemePreset("matcha").scheme.background).not.toBe("0 0% 0%")
  })
})

describe("detectThemePreset", () => {
  const BUILT_IN = PRESETS.filter((preset) => preset !== "custom")

  it.each(BUILT_IN)("recognises a saved %s theme", (preset) => {
    const { scheme, headerFontFamily, bodyFontFamily } = resolveThemePreset(preset)
    // Round-trip through JSON, as the settings API does.
    const saved = JSON.parse(JSON.stringify(scheme))
    expect(detectThemePreset(saved, headerFontFamily, bodyFontFamily)).toBe(preset)
  })

  it("treats no saved theme with default fonts as light", () => {
    expect(detectThemePreset(null, DEFAULT_HEADER_FONT_FAMILY, DEFAULT_BODY_FONT_FAMILY)).toBe("light")
  })

  it("recognises a preset saved before newer color keys existed", () => {
    const { scheme, headerFontFamily, bodyFontFamily } = resolveThemePreset("light")
    const { tagForeground: _dropped, ...older } = scheme
    expect(detectThemePreset(older, headerFontFamily, bodyFontFamily)).toBe("light")
  })

  it("ignores whitespace differences in stored values", () => {
    const { scheme, headerFontFamily, bodyFontFamily } = resolveThemePreset("pink")
    expect(detectThemePreset({ ...scheme, primary: ` ${scheme.primary}  ` }, headerFontFamily, bodyFontFamily)).toBe("pink")
  })

  it("is custom once a color, the radius, or a font differs", () => {
    const { scheme, headerFontFamily, bodyFontFamily } = resolveThemePreset("matcha")
    expect(detectThemePreset({ ...scheme, primary: "0 0% 0%" }, headerFontFamily, bodyFontFamily)).toBe("custom")
    expect(detectThemePreset({ ...scheme, radius: "0.75rem" }, headerFontFamily, bodyFontFamily)).toBe("custom")
    expect(detectThemePreset(scheme, "Inter", bodyFontFamily)).toBe("custom")
    expect(detectThemePreset(scheme, headerFontFamily, "Inter")).toBe("custom")
  })
})

import { describe, expect, it } from "vitest"
import {
  COLOR_SCHEME_PRESETS,
  applyColorScheme,
  buildThemeExport,
  detectThemePreset,
  getDefaultColorScheme,
  mergeColorScheme,
  parseImportedColorScheme,
  resolveThemePreset,
  type ThemePreset,
} from "./settings"
import { THEME_COLOR_KEYS, THEME_OUTLINE_CSS_VARS, getThemeOutlineCssVars } from "./theme-colors"
import type { Theme } from "./types"
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

  it.each(PRESETS)("%s keeps the soft outline", (preset) => {
    expect(resolveThemePreset(preset).scheme.outline).toBe("soft")
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

  it.each(BUILT_IN)("recognises a %s theme saved before the outline field existed", (preset) => {
    const { scheme, headerFontFamily, bodyFontFamily } = resolveThemePreset(preset)
    const { outline: _dropped, ...older } = scheme
    expect("outline" in older).toBe(false)
    expect(detectThemePreset(older, headerFontFamily, bodyFontFamily)).toBe(preset)
  })

  it.each(BUILT_IN)("is custom when a %s theme has the hard outline", (preset) => {
    const { scheme, headerFontFamily, bodyFontFamily } = resolveThemePreset(preset)
    expect(detectThemePreset({ ...scheme, outline: "hard" }, headerFontFamily, bodyFontFamily)).toBe("custom")
  })

  it("treats an unknown stored outline as soft", () => {
    const { scheme, headerFontFamily, bodyFontFamily } = resolveThemePreset("dark")
    const stored = { ...scheme, outline: "neon" } as unknown as Theme
    expect(detectThemePreset(stored, headerFontFamily, bodyFontFamily)).toBe("dark")
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

describe("theme outline", () => {
  const SOFT_VARS = {
    "--outline-width": "initial",
    "--outline-color": "initial",
    "--outline-shadow": "initial",
    "--outline-flat": "initial",
  }
  const HARD_VARS = {
    "--outline-width": "2px",
    "--outline-color": "hsl(var(--foreground))",
    "--outline-shadow": "4px 4px 0 0 hsl(var(--foreground))",
    "--outline-flat": "0 0 #0000",
  }

  describe("mergeColorScheme", () => {
    it("defaults to soft when there is no theme or no outline", () => {
      expect(getDefaultColorScheme().outline).toBe("soft")
      expect(mergeColorScheme(null).outline).toBe("soft")
      expect(mergeColorScheme(undefined).outline).toBe("soft")
      expect(mergeColorScheme({}).outline).toBe("soft")
      expect(mergeColorScheme({ primary: "0 0% 0%", radius: "0" }).outline).toBe("soft")
    })

    it("keeps a saved hard outline", () => {
      expect(mergeColorScheme({ outline: "hard" }).outline).toBe("hard")
    })

    it.each(["neon", "", "HARD", 2, true, null])("falls back to soft for %j", (value) => {
      expect(mergeColorScheme({ outline: value } as unknown as Theme).outline).toBe("soft")
    })
  })

  describe("css variables", () => {
    it("sets a 2px foreground border and a solid offset foreground shadow for hard", () => {
      expect(getThemeOutlineCssVars("hard")).toEqual(HARD_VARS)
      expect(applyColorScheme({ ...getDefaultColorScheme(), outline: "hard" })).toMatchObject(HARD_VARS)
    })

    it("un-defines every outline variable for soft, so the soft fallbacks in globals.css apply", () => {
      expect(getThemeOutlineCssVars("soft")).toEqual(SOFT_VARS)
      expect(applyColorScheme({ ...getDefaultColorScheme(), outline: "soft" })).toMatchObject(SOFT_VARS)
    })

    it("treats a theme without the field, or with a bad value, as soft", () => {
      const { outline: _dropped, ...older } = getDefaultColorScheme()
      expect(applyColorScheme(older)).toMatchObject(SOFT_VARS)
      expect(applyColorScheme({ outline: "neon" } as unknown as Theme)).toMatchObject(SOFT_VARS)
      expect(getThemeOutlineCssVars(undefined)).toEqual(SOFT_VARS)
    })

    it("emits the same keys for every theme, so ThemeProvider can clear a hard theme by key", () => {
      const defaultKeys = Object.keys(applyColorScheme(getDefaultColorScheme()))
      const hardKeys = Object.keys(applyColorScheme({ ...resolveThemePreset("arcade").scheme, outline: "hard" }))
      for (const cssVar of THEME_OUTLINE_CSS_VARS) {
        expect(defaultKeys).toContain(cssVar)
      }
      expect([...hardKeys].sort()).toEqual([...defaultKeys].sort())
    })

    it("leaves the color and radius variables alone", () => {
      const scheme = resolveThemePreset("matcha").scheme
      const soft = applyColorScheme(scheme)
      const hard = applyColorScheme({ ...scheme, outline: "hard" })
      for (const key of Object.keys(soft)) {
        if ((THEME_OUTLINE_CSS_VARS as readonly string[]).includes(key)) continue
        expect(hard[key], key).toBe(soft[key])
      }
      expect(soft["--radius"]).toBe("0.25rem")
    })
  })

  describe("import and export", () => {
    const fonts = { headerFontFamily: "Lora", bodyFontFamily: "Figtree" }

    it.each(["soft", "hard"] as const)("round-trips a %s theme through a theme file", (outline) => {
      const theme: Theme = { ...resolveThemePreset("matcha").scheme, outline }
      const exported = buildThemeExport(theme, fonts)
      expect(exported.outline).toBe(outline)

      const imported = parseImportedColorScheme(JSON.stringify(exported))
      expect(imported?.theme.outline).toBe(outline)
      expect(imported?.theme).toEqual(theme)
      expect(imported?.headerFontFamily).toBe("Lora")
      expect(imported?.bodyFontFamily).toBe("Figtree")
    })

    it("exports soft for a theme saved before the field existed", () => {
      const { outline: _dropped, ...older } = resolveThemePreset("light").scheme
      expect(buildThemeExport(older, fonts).outline).toBe("soft")
    })

    it("imports a file without an outline as soft once merged", () => {
      const { outline: _dropped, ...older } = buildThemeExport(resolveThemePreset("pink").scheme, fonts)
      const imported = parseImportedColorScheme(JSON.stringify(older))
      expect(imported).not.toBeNull()
      expect(imported?.theme.outline).toBeUndefined()
      expect(mergeColorScheme(imported?.theme).outline).toBe("soft")
    })

    it.each(["neon", "HARD", "", 1, true, null, ["hard"], { value: "hard" }])(
      "ignores an invalid outline in a theme file: %j",
      (value) => {
        const imported = parseImportedColorScheme(JSON.stringify({ background: "0 0% 100%", outline: value }))
        expect(imported?.theme).toEqual({ background: "0 0% 100%" })
      }
    )

    it("accepts a file that only sets the outline", () => {
      expect(parseImportedColorScheme(JSON.stringify({ outline: "hard" }))?.theme).toEqual({ outline: "hard" })
    })
  })
})

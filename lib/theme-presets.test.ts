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
import {
  DEFAULT_THEME_RADIUS,
  HSL_TRIPLE_PATTERN,
  THEME_COLOR_KEYS,
  THEME_OUTLINE_CSS_VARS,
  THEME_RADIUS_OPTIONS,
  getThemeOutlineCssVars,
  normalizeStoredTheme,
  sanitizeTheme,
} from "./theme-colors"
import type { Theme } from "./types"
import { DEFAULT_BODY_FONT_FAMILY, DEFAULT_HEADER_FONT_FAMILY, FONT_OPTIONS } from "./fonts"

const RADIUS_VALUES = THEME_RADIUS_OPTIONS.map((option) => option.value as string)
const FONT_IDS = FONT_OPTIONS.map((option) => option.value as string)
const PRESETS = Object.keys(COLOR_SCHEME_PRESETS) as ThemePreset[]

describe("theme presets", () => {
  it.each(PRESETS)("%s defines every theme color as an HSL triple", (preset) => {
    const { scheme } = resolveThemePreset(preset)
    for (const key of THEME_COLOR_KEYS) {
      expect(scheme[key], `${preset}.${key}`).toMatch(HSL_TRIPLE_PATTERN)
    }
  })

  it.each(PRESETS)("%s resolves to a radius and fonts the theme editor offers", (preset) => {
    const resolved = resolveThemePreset(preset)
    expect(RADIUS_VALUES).toContain(resolved.scheme.radius)
    expect(FONT_IDS).toContain(resolved.headerFontFamily)
    expect(FONT_IDS).toContain(resolved.bodyFontFamily)
  })

  it("keeps the original presets on default fonts and medium corners", () => {
    for (const preset of ["light", "dark", "pink"] as const) {
      const resolved = resolveThemePreset(preset)
      expect(resolved.headerFontFamily).toBe(DEFAULT_HEADER_FONT_FAMILY)
      expect(resolved.bodyFontFamily).toBe(DEFAULT_BODY_FONT_FAMILY)
      expect(resolved.scheme.radius).toBe(DEFAULT_THEME_RADIUS)
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

describe("sanitizeTheme", () => {
  it.each(["bad", 7, true, null, undefined, ["0 0% 0%"]])("rejects %j, which is not a theme object", (input) => {
    expect(sanitizeTheme(input)).toBeNull()
  })

  it("keeps a complete theme as it is", () => {
    const theme: Theme = { ...resolveThemePreset("arcade").scheme, outline: "hard" }
    expect(sanitizeTheme(JSON.parse(JSON.stringify(theme)))).toEqual(theme)
  })

  it("drops unknown keys, whatever they hold", () => {
    const input = JSON.parse('{"background":"0 0% 0%","graphOverlay":true,"constructor":"0 0% 0%","__proto__":{"primary":"0 0% 0%"},"note":{"a":1}}')
    expect(sanitizeTheme(input)).toEqual({ background: "0 0% 0%" })
  })

  it.each([
    ["a number", 5],
    ["an object", { h: 0 }],
    ["the comma form", "222, 47%, 11%"],
    ["an hsl() wrapper", "hsl(222 47% 11%)"],
    ["an alpha suffix", "222 47% 11% / 0.5"],
    ["a trailing dot", "222. 47% 11%"],
    ["a negative number", "-10 47% 11%"],
    ["a missing percent sign", "222 47 11"],
    ["css that is not a color", "0 0% 0%; --x: url(https://example.invalid)"],
    ["an oversized value", `0 0% ${"0".repeat(5000)}%`],
  ])("drops a color that is %s", (_label, value) => {
    expect(sanitizeTheme({ background: value, foreground: "0 0% 100%" })).toEqual({ foreground: "0 0% 100%" })
  })

  it("stores one form of a color: single spaces, no padding", () => {
    expect(sanitizeTheme({ background: "  222.2   47.4%\t11.2% " })).toEqual({ background: "222.2 47.4% 11.2%" })
  })

  it.each(RADIUS_VALUES)("keeps the editor radius %s", (radius) => {
    expect(sanitizeTheme({ radius })).toEqual({ radius })
  })

  it.each(["rem", "1rem", "8px", "0.5em", ".5rem", "0.5rem;", 0, null])("drops the radius %j", (radius) => {
    expect(sanitizeTheme({ radius })).toEqual({})
  })

  it.each(["neon", "HARD", 1, null])("drops the outline %j", (outline) => {
    expect(sanitizeTheme({ outline })).toEqual({})
  })
})

describe("normalizeStoredTheme", () => {
  it("is null when no theme is saved", () => {
    expect(normalizeStoredTheme(null, "0.75rem")).toBeNull()
    expect(normalizeStoredTheme(undefined)).toBeNull()
  })

  it("takes the radius from the border_radius column, then the theme, then the default", () => {
    expect(normalizeStoredTheme({ radius: "0" }, "0.75rem")?.radius).toBe("0.75rem")
    expect(normalizeStoredTheme({ radius: "0" }, null)?.radius).toBe("0")
    expect(normalizeStoredTheme({ radius: "0" }, "12px")?.radius).toBe("0")
    expect(normalizeStoredTheme({}, null)?.radius).toBe(DEFAULT_THEME_RADIUS)
    expect(normalizeStoredTheme({ radius: "1rem" }, null)?.radius).toBe(DEFAULT_THEME_RADIUS)
  })

  it("reads a theme saved before the outline field existed as soft, and keeps hard", () => {
    expect(normalizeStoredTheme({ background: "0 0% 0%" })?.outline).toBe("soft")
    expect(normalizeStoredTheme({ outline: "hard" })?.outline).toBe("hard")
  })

  it("sanitises what an older, unvalidated save may have stored", () => {
    expect(normalizeStoredTheme({ background: "0 0% 0%", primary: "red", extra: "x" }, null)).toEqual({
      background: "0 0% 0%",
      radius: DEFAULT_THEME_RADIUS,
      outline: "soft",
    })
  })
})

describe("applyColorScheme", () => {
  it("only emits variables for known theme keys", () => {
    const stored = JSON.parse('{"constructor":"0 0% 0%","toString":"0 0% 0%","hasOwnProperty":"0 0% 0%"}') as Theme
    expect(Object.keys(applyColorScheme(stored)).sort()).toEqual(
      Object.keys(applyColorScheme(getDefaultColorScheme())).sort()
    )
  })
})

describe("theme import", () => {
  const fonts = { headerFontFamily: "Inter", bodyFontFamily: "Inter" }
  const importColor = (value: unknown) =>
    parseImportedColorScheme(JSON.stringify({ background: value, outline: "hard" }))?.theme

  it("converts the hsl() comma form to the stored triple", () => {
    expect(importColor("hsl(222.2, 47.4%, 11.2%)")).toEqual({ background: "222.2 47.4% 11.2%", outline: "hard" })
    expect(importColor("hsl(222.2,47.4%,11.2%)")?.background).toBe("222.2 47.4% 11.2%")
    expect(importColor("hsl(222.2 47.4% 11.2%)")?.background).toBe("222.2 47.4% 11.2%")
  })

  it.each([
    "222.2 47.4% 11.2% / 0.5",
    "hsl(222.2, 47.4%, 11.2%, 0.5)",
    "hsl(222.2 47.4% 11.2% / 0.5)",
    "222. 47.4% 11.2%",
    "222.2, 47.4%, 11.2%",
    "#1a1f2e",
  ])("ignores the color %j", (value) => {
    expect(importColor(value)).toEqual({ outline: "hard" })
  })

  it.each(["rem", "1rem", "8px", "0.5em"])("ignores the radius %j, which the editor does not offer", (radius) => {
    expect(parseImportedColorScheme(JSON.stringify({ background: "0 0% 0%", radius }))?.theme).toEqual({
      background: "0 0% 0%",
    })
  })

  it.each(["[]", '["0 0% 0%"]', '"hard"', "7", "null", "not json"])("rejects the file %s", (file) => {
    expect(parseImportedColorScheme(file)).toBeNull()
  })

  it("produces colors every opacity utility can use", () => {
    const imported = parseImportedColorScheme(
      JSON.stringify({ ...buildThemeExport(resolveThemePreset("pink").scheme, fonts), primary: "hsl(340, 70%, 48%)" })
    )
    for (const key of THEME_COLOR_KEYS) {
      expect(mergeColorScheme(imported?.theme)[key], key).toMatch(HSL_TRIPLE_PATTERN)
    }
  })

  // The settings page applies an import as mergeColorScheme(imported.theme).
  describe("merged into a theme", () => {
    it("round-trips a hard-outline, radius-0 theme file", () => {
      const theme: Theme = { ...resolveThemePreset("arcade").scheme, outline: "hard" }
      expect(theme.radius).toBe("0")
      const imported = parseImportedColorScheme(JSON.stringify(buildThemeExport(theme, fonts)))
      expect(mergeColorScheme(imported?.theme)).toEqual(theme)
    })

    it.each(RADIUS_VALUES)("takes the radius %s from the file", (radius) => {
      const imported = parseImportedColorScheme(JSON.stringify({ background: "0 0% 0%", radius }))
      expect(mergeColorScheme(imported?.theme).radius).toBe(radius)
    })

    it("fills what the file leaves out from the defaults, not from the current theme", () => {
      const imported = parseImportedColorScheme(JSON.stringify({ background: "0 0% 0%" }))
      expect(mergeColorScheme(imported?.theme)).toEqual({ ...getDefaultColorScheme(), background: "0 0% 0%" })
      expect(mergeColorScheme(imported?.theme).radius).toBe(DEFAULT_THEME_RADIUS)
    })
  })
})

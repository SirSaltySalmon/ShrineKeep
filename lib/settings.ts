import { Theme, UserSettings } from "./types"
import { createSupabaseClient } from "./supabase/client"
import {
  DEFAULT_COLOR_SCHEME,
  DARK_COLOR_SCHEME,
  PINK_COLOR_SCHEME,
  MATCHA_COLOR_SCHEME,
  ARCADE_COLOR_SCHEME,
  DEFAULT_THEME_RADIUS,
  THEME_COLOR_KEYS,
  THEME_KEY_TO_CSS_VAR,
  getThemeOutlineCssVars,
  normalizeThemeOutline,
  sanitizeTheme,
} from "./theme-colors"
import { DEFAULT_BODY_FONT_FAMILY, DEFAULT_HEADER_FONT_FAMILY, FONT_OPTIONS } from "./fonts"
import type { FontFamilyId } from "./fonts"

// Re-export for consumers that import from settings
export { DEFAULT_COLOR_SCHEME, DARK_COLOR_SCHEME }

export type ThemePreset = "light" | "dark" | "pink" | "matcha" | "arcade" | "custom"

export interface ThemePresetDefinition {
  name: string
  /** Colors plus `radius` and `outline`. */
  scheme: Theme
  /** Fonts the preset sets. Omitted means the app default (same fields a theme file carries). */
  headerFontFamily?: FontFamilyId
  bodyFontFamily?: FontFamilyId
}

export const COLOR_SCHEME_PRESETS: Record<ThemePreset, ThemePresetDefinition> = {
  light: {
    name: "Light Mode",
    scheme: DEFAULT_COLOR_SCHEME,
  },
  dark: {
    name: "Dark Mode",
    scheme: DARK_COLOR_SCHEME,
  },
  pink: {
    name: "Pink Mode",
    scheme: PINK_COLOR_SCHEME,
  },
  matcha: {
    name: "Matcha",
    scheme: MATCHA_COLOR_SCHEME,
    headerFontFamily: "Lora",
    bodyFontFamily: "Figtree",
  },
  arcade: {
    name: "Arcade",
    scheme: ARCADE_COLOR_SCHEME,
    headerFontFamily: "JetBrains Mono",
    bodyFontFamily: "JetBrains Mono",
  },
  custom: {
    name: "Custom",
    scheme: DEFAULT_COLOR_SCHEME, // Placeholder, will be replaced with user's custom scheme
  },
}

/**
 * Get default color scheme (light mode)
 */
export function getDefaultColorScheme(): Theme {
  return { ...DEFAULT_COLOR_SCHEME }
}

/**
 * Get color scheme by preset name
 */
export function getColorSchemeByPreset(preset: ThemePreset): Theme {
  if (preset === "custom") return getDefaultColorScheme()
  return { ...COLOR_SCHEME_PRESETS[preset].scheme }
}

/** Everything a preset applies: colors, radius, outline, and both fonts, with app defaults filled in. */
export interface ResolvedThemePreset {
  scheme: Theme
  headerFontFamily: FontFamilyId
  bodyFontFamily: FontFamilyId
}

export function resolveThemePreset(preset: ThemePreset): ResolvedThemePreset {
  const definition = COLOR_SCHEME_PRESETS[preset]
  const scheme = getColorSchemeByPreset(preset)
  return {
    scheme: {
      ...scheme,
      radius: scheme.radius ?? DEFAULT_THEME_RADIUS,
      outline: normalizeThemeOutline(scheme.outline),
    },
    headerFontFamily: definition.headerFontFamily ?? DEFAULT_HEADER_FONT_FAMILY,
    bodyFontFamily: definition.bodyFontFamily ?? DEFAULT_BODY_FONT_FAMILY,
  }
}

const normalizeThemeValue = (value: string | undefined) => (value ?? "").trim().replace(/\s+/g, " ")

/**
 * Which built-in preset a saved look is, or "custom" if it is none of them.
 *
 * The preset's name is never stored, only its values, so this compares them: a theme is
 * a given preset exactly as long as every color, the radius, the outline, and both fonts
 * still equal that preset's. Change any one and it is custom. A theme saved before
 * `outline` existed has none, which counts as soft, so it still matches its preset.
 */
export function detectThemePreset(
  theme: Theme | null | undefined,
  headerFontFamily: FontFamilyId,
  bodyFontFamily: FontFamilyId
): ThemePreset {
  const current = mergeColorScheme(theme)
  const currentRadius = normalizeThemeValue(current.radius) || DEFAULT_THEME_RADIUS

  for (const preset of Object.keys(COLOR_SCHEME_PRESETS) as ThemePreset[]) {
    if (preset === "custom") continue
    const resolved = resolveThemePreset(preset)
    if (resolved.headerFontFamily !== headerFontFamily || resolved.bodyFontFamily !== bodyFontFamily) continue
    if (normalizeThemeValue(resolved.scheme.radius) !== currentRadius) continue
    if (normalizeThemeOutline(resolved.scheme.outline) !== current.outline) continue
    const sameColors = THEME_COLOR_KEYS.every(
      (key) => normalizeThemeValue(current[key]) === normalizeThemeValue(resolved.scheme[key])
    )
    if (sameColors) return preset
  }
  return "custom"
}

/** Result of parsing an imported theme JSON (colors, radius, outline, fonts; no graph_overlay). */
export interface ParsedThemeImport {
  theme: Partial<Theme>
  headerFontFamily?: FontFamilyId
  bodyFontFamily?: FontFamilyId
}

const VALID_FONT_IDS = new Set(FONT_OPTIONS.map((o) => o.value))

/**
 * Parse imported theme JSON. Accepts colors, radius, outline, header_font_family, and body_font_family.
 * Values go through `sanitizeTheme()`, so anything the app could not render is ignored: a color
 * that is not an HSL triple (an `hsl()` wrapper is unwrapped first), a radius the editor does not
 * offer, an outline that is not "soft" or "hard".
 * Does not read or apply graph_overlay (chart overlay preference is not exported).
 */
export function parseImportedColorScheme(jsonString: string): ParsedThemeImport | null {
  try {
    const parsed: unknown = JSON.parse(jsonString)

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null
    }
    const file = parsed as Record<string, unknown>

    const colors: Record<string, unknown> = {}
    for (const key of THEME_COLOR_KEYS) {
      const value = file[key]
      if (typeof value === "string") colors[key] = hslToCssVariable(value)
    }
    const scheme: Partial<Theme> = sanitizeTheme({ ...file, ...colors }) ?? {}

    let headerFontFamily: FontFamilyId | undefined
    let bodyFontFamily: FontFamilyId | undefined
    if (
      typeof file.header_font_family === "string" &&
      VALID_FONT_IDS.has(file.header_font_family as FontFamilyId)
    ) {
      headerFontFamily = file.header_font_family as FontFamilyId
    }
    if (
      typeof file.body_font_family === "string" &&
      VALID_FONT_IDS.has(file.body_font_family as FontFamilyId)
    ) {
      bodyFontFamily = file.body_font_family as FontFamilyId
    }

    if (Object.keys(scheme).length === 0 && !headerFontFamily && !bodyFontFamily) {
      return null
    }

    return { theme: scheme, headerFontFamily, bodyFontFamily }
  } catch (error) {
    console.error("Error parsing imported theme:", error)
    return null
  }
}

export interface ThemeExportFonts {
  headerFontFamily: string
  bodyFontFamily: string
}

/**
 * Build the theme export object (colors, radius, outline, header_font_family, body_font_family). Omits graph_overlay.
 */
export function buildThemeExport(
  theme: Theme,
  fonts: ThemeExportFonts
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of THEME_COLOR_KEYS) {
    const v = theme[key]
    if (v != null && typeof v === "string") out[key] = v
  }
  if (theme.radius) out.radius = theme.radius
  out.outline = normalizeThemeOutline(theme.outline)
  out.header_font_family = fonts.headerFontFamily
  out.body_font_family = fonts.bodyFontFamily
  return out
}

/**
 * Defaults, then the given theme's values. Use it for anything partial: a saved theme, or the
 * `theme` of a parsed import, where a file without a radius or outline gets the default one.
 * `outline` always comes back as "soft" or "hard": a theme without one (or with an unknown
 * value) is soft.
 */
export function mergeColorScheme(custom?: Theme | null): Theme {
  if (!custom) return getDefaultColorScheme()
  return { ...DEFAULT_COLOR_SCHEME, ...custom, outline: normalizeThemeOutline(custom.outline) }
}

/**
 * Convert HSL color string to CSS variable format
 * Input: "hsl(222.2, 47.4%, 11.2%)" or "222.2 47.4% 11.2%"
 * Output: "222.2 47.4% 11.2%"
 */
export function hslToCssVariable(hsl: string): string {
  const match = hsl.trim().match(/^hsl\(([^)]*)\)$/)
  // If already in CSS variable format, return as-is
  if (!match) return hsl.trim()

  // The stored form is space-separated: commas would break `hsl(var(--token) / <alpha>)`.
  return match[1]
    .split(",")
    .map((part) => part.trim())
    .join(" ")
}

/**
 * Convert HSL CSS variable format to hex
 * Input: "222.2 47.4% 11.2%"
 * Output: "#1a1f2e"
 */
export function hslToHex(hsl: string): string {
  // Parse HSL values
  const parts = hsl.trim().split(/\s+/)
  if (parts.length !== 3) throw new Error("Invalid HSL format")

  const h = parseFloat(parts[0])
  const s = parseFloat(parts[1]) / 100
  const l = parseFloat(parts[2]) / 100

  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2

  let r = 0,
    g = 0,
    b = 0

  if (h >= 0 && h < 60) {
    r = c
    g = x
    b = 0
  } else if (h >= 60 && h < 120) {
    r = x
    g = c
    b = 0
  } else if (h >= 120 && h < 180) {
    r = 0
    g = c
    b = x
  } else if (h >= 180 && h < 240) {
    r = 0
    g = x
    b = c
  } else if (h >= 240 && h < 300) {
    r = x
    g = 0
    b = c
  } else {
    r = c
    g = 0
    b = x
  }

  r = Math.round((r + m) * 255)
  g = Math.round((g + m) * 255)
  b = Math.round((b + m) * 255)

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`
}

/**
 * Convert hex to HSL CSS variable format
 * Input: "#1a1f2e"
 * Output: "222.2 47.4% 11.2%"
 */
export function hexToHsl(hex: string): string {
  // Remove # if present
  hex = hex.replace("#", "")

  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255
  const g = parseInt(hex.substring(2, 4), 16) / 255
  const b = parseInt(hex.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0,
    s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  h = Math.round(h * 360 * 10) / 10
  s = Math.round(s * 100 * 10) / 10
  const lPercent = Math.round(l * 100 * 10) / 10

  return `${h} ${s}% ${lPercent}%`
}

/**
 * Generate a unique share token for wishlist
 */
export function generateShareToken(): string {
  return crypto.randomUUID()
}

/**
 * Get user settings with defaults
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single()

  if (error || !data) {
    // Return defaults if no settings exist
    return {
      user_id: userId,
      ai_widget_visible: true,
      dashboard_demo_prompt_dismissed: false,
      ai_tutorial_reset_at: null,
      color_scheme: null,
      header_font_family: "Inter",
      body_font_family: "Inter",
      wishlist_link_enabled: false,
      wishlist_share_token: null,
      wishlist_apply_colors: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  return data
}

export interface ApplyColorSchemeOptions {
  /** If set, adds --font-sans (body stack) to the returned style object (e.g. for previews). */
  bodyFontFamily?: string
  /** If set, adds --font-heading to the returned style object. */
  headerFontFamily?: string
}

/**
 * Apply color scheme to CSS variables.
 * Returns a style object that can be injected. Includes `color: hsl(var(--foreground))`
 * so the element uses the scheme's foreground; pass font stacks in options for isolated previews.
 * Always includes the `--outline-*` variables for the scheme's outline style, so the same
 * keys are set for every theme and can be cleared by key (see ThemeProvider).
 */
export function applyColorScheme(
  colors: Theme,
  options?: ApplyColorSchemeOptions
): Record<string, string> {
  const merged = mergeColorScheme(colors)
  const cssVars: Record<string, string> = {}

  // Walk the known keys, not the theme's: a stored theme can carry any key (even "constructor").
  for (const [key, cssVar] of Object.entries(THEME_KEY_TO_CSS_VAR)) {
    const value = merged[key as keyof typeof THEME_KEY_TO_CSS_VAR]
    if (typeof value === "string" && value) {
      cssVars[cssVar] = value
    }
  }

  Object.assign(cssVars, getThemeOutlineCssVars(merged.outline))

  if (merged.foreground) {
    cssVars.color = "hsl(var(--foreground))"
  }

  if (options?.bodyFontFamily) {
    cssVars["--font-sans"] = options.bodyFontFamily
  }
  if (options?.headerFontFamily) {
    cssVars["--font-heading"] = options.headerFontFamily
  }

  return cssVars
}

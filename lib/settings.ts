import { Theme, UserSettings } from "./types"
import { createSupabaseClient } from "./supabase/client"
import {
  DEFAULT_COLOR_SCHEME,
  DARK_COLOR_SCHEME,
  THEME_COLOR_KEYS,
  THEME_KEY_TO_CSS_VAR,
} from "./theme-colors"
import { FONT_OPTIONS } from "./fonts"
import type { FontFamilyId } from "./fonts"

// Re-export for consumers that import from settings
export { DEFAULT_COLOR_SCHEME, DARK_COLOR_SCHEME }

export type ThemePreset = "light" | "dark" | "custom"

export const COLOR_SCHEME_PRESETS: Record<ThemePreset, { name: string; scheme: Theme }> = {
  light: {
    name: "Light Mode",
    scheme: DEFAULT_COLOR_SCHEME,
  },
  dark: {
    name: "Dark Mode",
    scheme: DARK_COLOR_SCHEME,
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
  if (preset === "custom") {
    return getDefaultColorScheme()
  }
  return { ...COLOR_SCHEME_PRESETS[preset].scheme }
}

/** Result of parsing an imported theme JSON (colors, radius, font; no graph_overlay). */
export interface ParsedThemeImport {
  theme: Partial<Theme>
  fontFamily?: FontFamilyId
}

const VALID_FONT_IDS = new Set(FONT_OPTIONS.map((o) => o.value))

/**
 * Parse imported theme JSON. Accepts colors, radius, and font_family.
 * Does not read or apply graph_overlay (chart overlay preference is not exported).
 */
export function parseImportedColorScheme(jsonString: string): ParsedThemeImport | null {
  try {
    const parsed = JSON.parse(jsonString)

    if (typeof parsed !== "object" || parsed === null) {
      return null
    }

    const scheme: Partial<Theme> = {}
    const validKeys: (keyof Theme)[] = [...THEME_COLOR_KEYS, "radius"]

    const hslCssVarRegex = /^\d+\.?\d*\s+\d+\.?\d*%\s+\d+\.?\d*%(?:\s*\/\s*[\d.]+)?$/
    const hslParenRegex = /^hsl\([\d.]+,\s*[\d.]+%,\s*[\d.]+%\)$/

    for (const key of validKeys) {
      if (parsed[key] && typeof parsed[key] === "string") {
        const str = (parsed[key] as string).trim()
        if (key === "radius") {
          if (/^\d*(\.\d+)?(rem|px|em)$/.test(str) || str === "0") {
            scheme.radius = str
          }
        } else {
          if (hslCssVarRegex.test(str) || hslParenRegex.test(str)) {
            (scheme as Record<string, string>)[key] = hslToCssVariable(str)
          }
        }
      }
    }

    if (Object.keys(scheme).length === 0) return null

    let fontFamily: FontFamilyId | undefined
    if (typeof parsed.font_family === "string" && VALID_FONT_IDS.has(parsed.font_family as FontFamilyId)) {
      fontFamily = parsed.font_family as FontFamilyId
    }

    return { theme: scheme, fontFamily }
  } catch (error) {
    console.error("Error parsing imported theme:", error)
    return null
  }
}

/**
 * Build the theme export object (colors, radius, font_family). Omits graph_overlay.
 */
export function buildThemeExport(theme: Theme, fontFamily: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of THEME_COLOR_KEYS) {
    const v = theme[key]
    if (v != null && typeof v === "string") out[key] = v
  }
  if (theme.radius) out.radius = theme.radius
  out.font_family = fontFamily
  return out
}

/**
 * Merge custom colors with defaults
 */
export function mergeColorScheme(custom?: Theme | null): Theme {
  if (!custom) return getDefaultColorScheme()
  return { ...DEFAULT_COLOR_SCHEME, ...custom }
}

/**
 * Convert HSL color string to CSS variable format
 * Input: "hsl(222.2, 47.4%, 11.2%)" or "222.2 47.4% 11.2%"
 * Output: "222.2 47.4% 11.2%"
 */
export function hslToCssVariable(hsl: string): string {
  // If already in CSS variable format, return as-is
  if (!hsl.includes("hsl(")) return hsl.trim()

  // Extract HSL values from hsl() format
  const match = hsl.match(/hsl\(([^)]+)\)/)
  if (!match) return hsl.trim()

  return match[1].trim()
}

/**
 * Convert CSS variable format to HSL string
 * Input: "222.2 47.4% 11.2%"
 * Output: "hsl(222.2, 47.4%, 11.2%)"
 */
export function cssVariableToHsl(cssVar: string): string {
  return `hsl(${cssVar})`
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
      color_scheme: null,
      wishlist_is_public: false,
      wishlist_share_token: null,
      wishlist_apply_colors: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  }

  return data
}

/**
 * Apply color scheme to CSS variables
 * Returns a style object that can be injected
 */
export function applyColorScheme(colors: Theme): Record<string, string> {
  const merged = mergeColorScheme(colors)
  const cssVars: Record<string, string> = {}

  Object.entries(merged).forEach(([key, value]) => {
    const cssVar = THEME_KEY_TO_CSS_VAR[key as keyof typeof THEME_KEY_TO_CSS_VAR]
    if (typeof value === "string" && value && cssVar) {
      cssVars[cssVar] = value
    }
  })

  return cssVars
}

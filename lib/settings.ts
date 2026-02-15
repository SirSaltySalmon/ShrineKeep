import { ColorScheme, UserSettings } from "./types"
import { createSupabaseClient } from "./supabase/client"

// Default color scheme from globals.css (Light Mode)
export const DEFAULT_COLOR_SCHEME: ColorScheme = {
  background: "0 0% 100%",
  foreground: "222.2 84% 4.9%",
  card: "0 0% 100%",
  cardForeground: "222.2 84% 4.9%",
  popover: "0 0% 100%",
  popoverForeground: "222.2 84% 4.9%",
  primary: "222.2 47.4% 11.2%",
  primaryForeground: "210 40% 98%",
  secondary: "210 40% 96.1%",
  secondaryForeground: "222.2 47.4% 11.2%",
  muted: "210 40% 96.1%",
  mutedForeground: "215.4 16.3% 46.9%",
  accent: "210 40% 96.1%",
  accentForeground: "222.2 47.4% 11.2%",
  destructive: "0 84.2% 60.2%",
  destructiveForeground: "210 40% 98%",
  border: "214.3 31.8% 91.4%",
  input: "214.3 31.8% 91.4%",
  ring: "222.2 84% 4.9%",
  // Value colors (green for value, red for acquisition)
  valueColor: "142 76% 36%", // #22c55e converted to HSL
  acquisitionColor: "0 84% 60%", // #ef4444 converted to HSL
  graphValueColor: "142 76% 36%", // #22c55e converted to HSL
  graphAcquisitionColor: "0 84% 60%", // #ef4444 converted to HSL
  graphAxisColor: "214.3 31.8% 91.4%", // Axis lines and tick labels (muted)
  graphGridColor: "214.3 31.8% 91.4%", // Grid/divider lines
  graphTooltipBackground: "0 0% 100%", // Tooltip background
  graphTooltipForeground: "222.2 84% 4.9%", // Tooltip text
  thumbnailColor: "38 92% 50%", // Thumbnail fill (star and badge background)
  thumbnailForeground: "0 0% 100%", // Thumbnail badge text (white)
  thumbnailHighlight: "0 0% 100% / 0.2", // Hover for overlay icons (white 20%)
  radius: "0.5rem",
  graphOverlay: true,
}

// Dark mode color scheme from globals.css
export const DARK_COLOR_SCHEME: ColorScheme = {
  background: "222.2 84% 4.9%",
  foreground: "210 40% 98%",
  card: "222.2 84% 4.9%",
  cardForeground: "210 40% 98%",
  popover: "222.2 84% 4.9%",
  popoverForeground: "210 40% 98%",
  primary: "210 40% 98%",
  primaryForeground: "222.2 47.4% 11.2%",
  secondary: "217.2 32.6% 17.5%",
  secondaryForeground: "210 40% 98%",
  muted: "217.2 32.6% 17.5%",
  mutedForeground: "215 20.2% 65.1%",
  accent: "217.2 32.6% 17.5%",
  accentForeground: "210 40% 98%",
  destructive: "0 62.8% 30.6%",
  destructiveForeground: "210 40% 98%",
  border: "217.2 32.6% 17.5%",
  input: "217.2 32.6% 17.5%",
  ring: "212.7 26.8% 83.9%",
  // Value colors (lighter green/red for dark mode)
  valueColor: "142 70% 50%", // Lighter green for dark mode
  acquisitionColor: "0 72% 65%", // Lighter red for dark mode
  graphValueColor: "142 70% 50%",
  graphAcquisitionColor: "0 72% 65%",
  graphAxisColor: "217.2 32.6% 17.5%", // Axis in dark mode
  graphGridColor: "217.2 32.6% 22%", // Grid lines (slightly lighter than axis)
  graphTooltipBackground: "222.2 84% 4.9%", // Tooltip bg dark
  graphTooltipForeground: "210 40% 98%", // Tooltip text light
  thumbnailColor: "38 92% 55%", // Slightly lighter amber for dark mode
  thumbnailForeground: "0 0% 100%", // Thumbnail badge text (white)
  thumbnailHighlight: "0 0% 100% / 0.2", // Hover for overlay icons
  radius: "0.5rem",
  graphOverlay: true,
}

export type ColorSchemePreset = "light" | "dark" | "custom"

export const COLOR_SCHEME_PRESETS: Record<ColorSchemePreset, { name: string; scheme: ColorScheme }> = {
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
export function getDefaultColorScheme(): ColorScheme {
  return { ...DEFAULT_COLOR_SCHEME }
}

/**
 * Get color scheme by preset name
 */
export function getColorSchemeByPreset(preset: ColorSchemePreset): ColorScheme {
  if (preset === "custom") {
    return getDefaultColorScheme()
  }
  return { ...COLOR_SCHEME_PRESETS[preset].scheme }
}

/**
 * Parse imported color scheme from JSON
 */
export function parseImportedColorScheme(jsonString: string): ColorScheme | null {
  try {
    const parsed = JSON.parse(jsonString)
    
    // Validate it's an object
    if (typeof parsed !== "object" || parsed === null) {
      return null
    }

    // Validate and convert color values
    const scheme: Partial<ColorScheme> = {}
    const validKeys: (keyof ColorScheme)[] = [
      "background",
      "foreground",
      "card",
      "cardForeground",
      "popover",
      "popoverForeground",
      "primary",
      "primaryForeground",
      "secondary",
      "secondaryForeground",
      "muted",
      "mutedForeground",
      "accent",
      "accentForeground",
      "destructive",
      "destructiveForeground",
      "border",
      "input",
      "ring",
      "valueColor",
      "acquisitionColor",
      "graphValueColor",
      "graphAcquisitionColor",
      "graphAxisColor",
      "graphGridColor",
      "graphTooltipBackground",
      "graphTooltipForeground",
      "thumbnailColor",
      "thumbnailForeground",
      "thumbnailHighlight",
      "radius",
    ]

    for (const key of validKeys) {
      if (parsed[key] && typeof parsed[key] === "string") {
        const str = (parsed[key] as string).trim()
        if (key === "radius") {
          // CSS length: number + unit (rem, px, em)
          if (/^\d*(\.\d+)?(rem|px|em)$/.test(str) || str === "0") {
            scheme.radius = str
          }
        } else {
          // Validate HSL format
          if (str.match(/^\d+\.?\d*\s+\d+\.?\d*%\s+\d+\.?\d*%$/) || 
              str.match(/^hsl\([\d.]+,\s*[\d.]+%,\s*[\d.]+%\)$/)) {
            scheme[key as keyof ColorScheme] = hslToCssVariable(str)
          }
        }
      }
    }

    return Object.keys(scheme).length > 0 ? (scheme as ColorScheme) : null
  } catch (error) {
    console.error("Error parsing imported color scheme:", error)
    return null
  }
}

/**
 * Merge custom colors with defaults
 */
export function mergeColorScheme(custom?: ColorScheme | null): ColorScheme {
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
export function applyColorScheme(colors: ColorScheme): Record<string, string> {
  const merged = mergeColorScheme(colors)
  const cssVars: Record<string, string> = {}

  // Map ColorScheme keys to CSS variable names
  const varMap: Record<keyof ColorScheme, string> = {
    background: "--background",
    foreground: "--foreground",
    card: "--card",
    cardForeground: "--card-foreground",
    popover: "--popover",
    popoverForeground: "--popover-foreground",
    primary: "--primary",
    primaryForeground: "--primary-foreground",
    secondary: "--secondary",
    secondaryForeground: "--secondary-foreground",
    muted: "--muted",
    mutedForeground: "--muted-foreground",
    accent: "--accent",
    accentForeground: "--accent-foreground",
    destructive: "--destructive",
    destructiveForeground: "--destructive-foreground",
    border: "--border",
    input: "--input",
    ring: "--ring",
    valueColor: "--value-color",
    acquisitionColor: "--acquisition-color",
    graphValueColor: "--graph-value-color",
    graphAcquisitionColor: "--graph-acquisition-color",
    thumbnailColor: "--thumbnail-color",
    thumbnailForeground: "--thumbnail-foreground",
    thumbnailHighlight: "--thumbnail-highlight",
    graphAxisColor: "--graph-axis-color",
    graphGridColor: "--graph-grid-color",
    graphTooltipBackground: "--graph-tooltip-background",
    graphTooltipForeground: "--graph-tooltip-foreground",
    radius: "--radius",
  }

  Object.entries(merged).forEach(([key, value]) => {
    if (value && varMap[key as keyof ColorScheme]) {
      cssVars[varMap[key as keyof ColorScheme]] = value
    }
  })

  return cssVars
}

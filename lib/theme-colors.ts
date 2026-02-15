import type { Theme } from "./types"

/** Theme keys that are editable colors (excludes radius). */
export type ThemeColorKey = keyof Omit<Theme, "radius">

export interface ThemeColorEntry {
  key: ThemeColorKey
  label: string
  defaultLight: string
  defaultDark: string
}

/**
 * Single source of truth for theme colors. Add a new color here and to the
 * appropriate THEME_EDITOR_GROUPS[].keys; then add the key to Theme in types.ts.
 */
export const THEME_COLOR_REGISTRY: ThemeColorEntry[] = [
  // Page & surfaces
  { key: "background", label: "Background", defaultLight: "0 0% 100%", defaultDark: "222.2 84% 4.9%" },
  { key: "foreground", label: "Foreground (text)", defaultLight: "222.2 84% 4.9%", defaultDark: "210 40% 98%" },
  { key: "card", label: "Card", defaultLight: "0 0% 100%", defaultDark: "222.2 84% 4.9%" },
  { key: "cardForeground", label: "Card text", defaultLight: "222.2 84% 4.9%", defaultDark: "210 40% 98%" },
  { key: "popover", label: "Popover", defaultLight: "0 0% 100%", defaultDark: "222.2 84% 4.9%" },
  { key: "popoverForeground", label: "Popover text", defaultLight: "222.2 84% 4.9%", defaultDark: "210 40% 98%" },
  // Buttons & actions
  { key: "primary", label: "Primary (e.g. Save)", defaultLight: "222.2 47.4% 11.2%", defaultDark: "210 40% 98%" },
  { key: "primaryForeground", label: "Primary text", defaultLight: "210 40% 98%", defaultDark: "222.2 47.4% 11.2%" },
  { key: "secondary", label: "Secondary", defaultLight: "210 40% 96.1%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "secondaryForeground", label: "Secondary text", defaultLight: "222.2 47.4% 11.2%", defaultDark: "210 40% 98%" },
  { key: "muted", label: "Muted", defaultLight: "210 40% 96.1%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "mutedForeground", label: "Muted text", defaultLight: "215.4 16.3% 46.9%", defaultDark: "215 20.2% 65.1%" },
  { key: "lightMuted", label: "Light muted", defaultLight: "210 25% 98.2%", defaultDark: "228 50% 7.8%" },
  { key: "accent", label: "Accent (hover)", defaultLight: "210 40% 96.1%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "accentForeground", label: "Accent text", defaultLight: "222.2 47.4% 11.2%", defaultDark: "210 40% 98%" },
  // Borders & focus
  { key: "border", label: "Border", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "input", label: "Input border", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "ring", label: "Focus ring", defaultLight: "222.2 84% 4.9%", defaultDark: "212.7 26.8% 83.9%" },
  { key: "selectableHoverRing", label: "Selection hover ring", defaultLight: "222.2 25% 88%", defaultDark: "217 20% 28%" },
  // Destructive
  { key: "destructive", label: "Destructive", defaultLight: "0 84.2% 60.2%", defaultDark: "0 62.8% 30.6%" },
  { key: "destructiveForeground", label: "Destructive text", defaultLight: "210 40% 98%", defaultDark: "210 40% 98%" },
  // Values & data
  { key: "valueColor", label: "Value color", defaultLight: "142 76% 36%", defaultDark: "142 70% 50%" },
  { key: "acquisitionColor", label: "Acquisition color", defaultLight: "0 84% 60%", defaultDark: "0 72% 65%" },
  // Graph
  { key: "graphValueColor", label: "Graph value line", defaultLight: "142 76% 36%", defaultDark: "142 70% 50%" },
  { key: "graphAcquisitionColor", label: "Graph acquisition line", defaultLight: "0 84% 60%", defaultDark: "0 72% 65%" },
  { key: "graphAxisColor", label: "Graph axes & labels", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "graphGridColor", label: "Graph grid lines", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 22%" },
  { key: "graphTooltipBackground", label: "Graph tooltip background", defaultLight: "0 0% 100%", defaultDark: "222.2 84% 4.9%" },
  { key: "graphTooltipForeground", label: "Graph tooltip text", defaultLight: "222.2 84% 4.9%", defaultDark: "210 40% 98%" },
  // Thumbnail
  { key: "thumbnailColor", label: "Thumbnail fill", defaultLight: "38 92% 50%", defaultDark: "38 92% 55%" },
  { key: "thumbnailForeground", label: "Thumbnail text & icons", defaultLight: "0 0% 100%", defaultDark: "0 0% 100%" },
  { key: "thumbnailHighlight", label: "Thumbnail highlight", defaultLight: "0 0% 100%", defaultDark: "0 0% 100%" },
  { key: "thumbnailHover", label: "Thumbnail icon hover", defaultLight: "0 0% 100%", defaultDark: "0 0% 100%" },
  // Tag colors
  { key: "tagRed", label: "Red", defaultLight: "0 84% 60%", defaultDark: "0 72% 65%" },
  { key: "tagOrange", label: "Orange", defaultLight: "25 95% 53%", defaultDark: "25 90% 60%" },
  { key: "tagYellow", label: "Yellow", defaultLight: "45 93% 47%", defaultDark: "45 90% 55%" },
  { key: "tagGreen", label: "Green", defaultLight: "142 76% 36%", defaultDark: "142 70% 50%" },
  { key: "tagBlue", label: "Blue", defaultLight: "217 91% 60%", defaultDark: "217 85% 65%" },
  { key: "tagIndigo", label: "Indigo", defaultLight: "239 84% 67%", defaultDark: "239 80% 72%" },
  { key: "tagViolet", label: "Violet", defaultLight: "258 90% 66%", defaultDark: "258 85% 72%" },
  { key: "tagForeground", label: "Tag text color", defaultLight: "0 0% 100%", defaultDark: "0 0% 100%" },
]

export const THEME_COLOR_KEYS: ThemeColorKey[] = THEME_COLOR_REGISTRY.map((e) => e.key)

const registryByKey = new Map(THEME_COLOR_REGISTRY.map((e) => [e.key, e]))

export function getThemeColorMeta(key: ThemeColorKey): { label: string; defaultLight: string; defaultDark: string } {
  const entry = registryByKey.get(key)
  if (!entry) throw new Error(`Unknown theme color key: ${key}`)
  return { label: entry.label, defaultLight: entry.defaultLight, defaultDark: entry.defaultDark }
}

/** Convert Theme camelCase key to CSS variable name (--kebab-case). */
function themeKeyToCssVar(key: ThemeColorKey | "radius"): string {
  if (key === "radius") return "--radius"
  return "--" + key.replace(/([A-Z])/g, "-$1").toLowerCase()
}

/** Map of Theme color keys (and radius) to CSS variable names. Used by applyColorScheme. */
export const THEME_KEY_TO_CSS_VAR: Record<ThemeColorKey | "radius", string> = {
  ...Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, themeKeyToCssVar(k)])),
  radius: "--radius",
} as Record<ThemeColorKey | "radius", string>

/** Build a full Theme from registry defaults plus radius. */
function buildScheme(
  getDefault: (e: ThemeColorEntry) => string,
  overrides: Partial<Theme> = {}
): Theme {
  const scheme: Theme = { ...overrides }
  for (const e of THEME_COLOR_REGISTRY) {
    (scheme as Record<string, string>)[e.key] = getDefault(e)
  }
  scheme.radius = overrides.radius ?? "0.5rem"
  return scheme
}

export const DEFAULT_COLOR_SCHEME: Theme = buildScheme((e) => e.defaultLight)
export const DARK_COLOR_SCHEME: Theme = buildScheme((e) => e.defaultDark)

/** Pink Mode: light theme based on light pink. */
export const PINK_COLOR_SCHEME: Theme = {
  ...buildScheme((e) => e.defaultLight),
  background: "340 45% 98%",
  foreground: "340 30% 14%",
  card: "340 40% 99%",
  cardForeground: "340 30% 14%",
  popover: "340 40% 99%",
  popoverForeground: "340 30% 14%",
  primary: "340 70% 48%",
  primaryForeground: "0 0% 100%",
  secondary: "340 35% 94%",
  secondaryForeground: "340 45% 28%",
  muted: "340 30% 95%",
  mutedForeground: "340 20% 42%",
  lightMuted: "340 28% 97%",
  accent: "340 35% 93%",
  accentForeground: "340 45% 28%",
  border: "340 25% 90%",
  input: "340 25% 90%",
  ring: "340 60% 45%",
  selectableHoverRing: "340 35% 82%",
  radius: "0.5rem",
}

/**
 * Editor group config: title and which color keys to show.
 * Preview JSX stays in the theme-editor component.
 */
export interface ThemeEditorGroupConfig {
  id: string
  title: string
  keys: ThemeColorKey[]
}

export const THEME_EDITOR_GROUPS: ThemeEditorGroupConfig[] = [
  { id: "page", title: "Page & surfaces", keys: ["background", "foreground", "card", "cardForeground", "popover", "popoverForeground", "lightMuted"] },
  { id: "buttons", title: "Buttons & actions", keys: ["primary", "primaryForeground", "secondary", "secondaryForeground", "muted", "mutedForeground", "accent", "accentForeground"] },
  { id: "borders", title: "Borders & focus", keys: ["border", "input", "ring", "selectableHoverRing"] },
  { id: "destructive", title: "Destructive", keys: ["destructive", "destructiveForeground"] },
  { id: "values", title: "Values & data", keys: ["valueColor", "acquisitionColor"] },
  { id: "graph", title: "Graph", keys: ["graphValueColor", "graphAcquisitionColor", "graphAxisColor", "graphGridColor", "graphTooltipBackground", "graphTooltipForeground"] },
  { id: "thumbnail", title: "Thumbnail", keys: ["thumbnailColor", "thumbnailForeground", "thumbnailHighlight", "thumbnailHover"] },
  { id: "tags", title: "Tag colors", keys: ["tagRed", "tagOrange", "tagYellow", "tagGreen", "tagBlue", "tagIndigo", "tagViolet", "tagForeground"] },
]

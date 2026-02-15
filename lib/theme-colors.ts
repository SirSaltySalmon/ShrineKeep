import type { Theme } from "./types"

/** Theme keys that are editable colors (excludes radius and graphOverlay). */
export type ThemeColorKey = keyof Omit<Theme, "radius" | "graphOverlay">

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
  { key: "itemSelected", label: "Selected item", defaultLight: "214 95% 93%", defaultDark: "214 32% 28%" },
  // Buttons & actions
  { key: "primary", label: "Primary (e.g. Save)", defaultLight: "222.2 47.4% 11.2%", defaultDark: "210 40% 98%" },
  { key: "primaryForeground", label: "Primary text", defaultLight: "210 40% 98%", defaultDark: "222.2 47.4% 11.2%" },
  { key: "secondary", label: "Secondary (e.g. Cancel)", defaultLight: "210 40% 96.1%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "secondaryForeground", label: "Secondary text", defaultLight: "222.2 47.4% 11.2%", defaultDark: "210 40% 98%" },
  { key: "muted", label: "Muted", defaultLight: "210 40% 96.1%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "mutedForeground", label: "Muted text", defaultLight: "215.4 16.3% 46.9%", defaultDark: "215 20.2% 65.1%" },
  { key: "accent", label: "Accent (hover)", defaultLight: "210 40% 96.1%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "accentForeground", label: "Accent text", defaultLight: "222.2 47.4% 11.2%", defaultDark: "210 40% 98%" },
  // Borders & focus
  { key: "border", label: "Border", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "input", label: "Input border", defaultLight: "214.3 31.8% 91.4%", defaultDark: "217.2 32.6% 17.5%" },
  { key: "ring", label: "Focus ring", defaultLight: "222.2 84% 4.9%", defaultDark: "212.7 26.8% 83.9%" },
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
  { key: "thumbnailHighlight", label: "Thumbnail highlight", defaultLight: "0 0% 100% / 0.2", defaultDark: "0 0% 100% / 0.2" },
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

/** Build a full Theme from registry defaults plus radius and graphOverlay. */
function buildScheme(
  getDefault: (e: ThemeColorEntry) => string,
  overrides: Partial<Theme> = {}
): Theme {
  const scheme: Theme = { ...overrides }
  for (const e of THEME_COLOR_REGISTRY) {
    (scheme as Record<string, string>)[e.key] = getDefault(e)
  }
  scheme.radius = overrides.radius ?? "0.5rem"
  scheme.graphOverlay = overrides.graphOverlay ?? true
  return scheme
}

export const DEFAULT_COLOR_SCHEME: Theme = buildScheme((e) => e.defaultLight)
export const DARK_COLOR_SCHEME: Theme = buildScheme((e) => e.defaultDark)

/**
 * Editor group config: title, description, and which color keys to show.
 * Preview JSX stays in the theme-editor component.
 */
export interface ThemeEditorGroupConfig {
  id: string
  title: string
  description?: string
  keys: ThemeColorKey[]
}

export const THEME_EDITOR_GROUPS: ThemeEditorGroupConfig[] = [
  { id: "page", title: "Page & surfaces", description: "Background and main surfaces", keys: ["background", "foreground", "card", "cardForeground", "popover", "popoverForeground", "itemSelected"] },
  { id: "buttons", title: "Buttons & actions", description: "Primary and secondary buttons; hover to see accent", keys: ["primary", "primaryForeground", "secondary", "secondaryForeground", "muted", "mutedForeground", "accent", "accentForeground"] },
  { id: "borders", title: "Borders & focus", description: "Border, input border, and focus ring. You can type in the input.", keys: ["border", "input", "ring"] },
  { id: "destructive", title: "Destructive", description: "Delete and danger actions", keys: ["destructive", "destructiveForeground"] },
  { id: "values", title: "Values & data", description: "Value and acquisition prices in the app", keys: ["valueColor", "acquisitionColor"] },
  { id: "graph", title: "Graph", description: "Value history chart: axes, grid, tooltip, and lines. Toggle below to show one graph (overlay) or two separate.", keys: ["graphValueColor", "graphAcquisitionColor", "graphAxisColor", "graphGridColor", "graphTooltipBackground", "graphTooltipForeground"] },
  { id: "thumbnail", title: "Thumbnail", description: "Thumbnail star and badge in item dialog; highlight is hover on overlay icons. Delete icon will use destructive color, however.", keys: ["thumbnailColor", "thumbnailForeground", "thumbnailHighlight", "thumbnailHover"] },
  { id: "tags", title: "Tag colors", description: "Colors for item tags (Red, Orange, Yellow, Green, Blue, Indigo, Violet). Used in tag chips and filters.", keys: ["tagRed", "tagOrange", "tagYellow", "tagGreen", "tagBlue", "tagIndigo", "tagViolet", "tagForeground"] },
]

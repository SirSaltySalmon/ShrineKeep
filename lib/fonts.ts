/**
 * Typography options for the theme editor.
 * Keys are stored in user_settings.font_family; labels are shown in the UI.
 */
export const FONT_OPTIONS = [
  { value: "Inter", label: "Inter" },
  { value: "Geist", label: "Geist" },
  { value: "Noto Sans", label: "Noto Sans" },
  { value: "Nunito Sans", label: "Nunito Sans" },
  { value: "Figtree", label: "Figtree" },
  { value: "Roboto", label: "Roboto" },
  { value: "Raleway", label: "Raleway" },
  { value: "DM Sans", label: "DM Sans" },
  { value: "Public Sans", label: "Public Sans" },
  { value: "Outfit", label: "Outfit" },
  { value: "Geist Mono", label: "Geist Mono" },
  { value: "JetBrains Mono", label: "JetBrains Mono" },
  { value: "Comic Sans", label: "Comic Sans" },
  { value: "Papyrus", label: "Papyrus" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Lora", label: "Lora" },
  { value: "Merriweather", label: "Merriweather" },
  { value: "Playfair Display", label: "Playfair Display" },
  { value: "Source Serif 4", label: "Source Serif 4" },
] as const

export type FontFamilyId = (typeof FONT_OPTIONS)[number]["value"]

export const DEFAULT_FONT_FAMILY: FontFamilyId = "Inter"

/**
 * CSS font-family value for --font-sans (body font).
 * Next/font variables (--font-*) are defined in layout; system fonts use literals.
 */
export const FONT_FAMILY_CSS: Record<FontFamilyId, string> = {
  Inter: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  Geist: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
  "Noto Sans": "var(--font-noto-sans), ui-sans-serif, system-ui, sans-serif",
  "Nunito Sans": "var(--font-nunito-sans), ui-sans-serif, system-ui, sans-serif",
  Figtree: "var(--font-figtree), ui-sans-serif, system-ui, sans-serif",
  Roboto: "var(--font-roboto), ui-sans-serif, system-ui, sans-serif",
  Raleway: "var(--font-raleway), ui-sans-serif, system-ui, sans-serif",
  "DM Sans": "var(--font-dm-sans), ui-sans-serif, system-ui, sans-serif",
  "Public Sans": "var(--font-public-sans), ui-sans-serif, system-ui, sans-serif",
  Outfit: "var(--font-outfit), ui-sans-serif, system-ui, sans-serif",
  "Geist Mono": "var(--font-geist-mono), ui-monospace, monospace",
  "JetBrains Mono": "var(--font-jetbrains-mono), ui-monospace, monospace",
  "Comic Sans": '"Comic Sans MS", "Comic Sans", cursive',
  Papyrus: "Papyrus, fantasy",
  "Times New Roman": "Times New Roman, serif",
  Lora: "var(--font-lora), Georgia, serif",
  Merriweather: "var(--font-merriweather), Georgia, serif",
  "Playfair Display": "var(--font-playfair-display), Georgia, serif",
  "Source Serif 4": "var(--font-source-serif-4), Georgia, serif",
}

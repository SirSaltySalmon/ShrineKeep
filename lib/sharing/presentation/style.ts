import type { CSSProperties } from "react"
import {
  FONT_FAMILY_CSS,
  DEFAULT_BODY_FONT_FAMILY,
  DEFAULT_HEADER_FONT_FAMILY,
  type FontFamilyId,
} from "@/lib/fonts"
import { applyColorScheme, getDefaultColorScheme } from "@/lib/settings"
import type { PublicStyle } from "../contracts"

function fontStack(key: string | null | undefined): string {
  if (key && key in FONT_FAMILY_CSS) return FONT_FAMILY_CSS[key as FontFamilyId]
  return FONT_FAMILY_CSS[DEFAULT_BODY_FONT_FAMILY]
}

/** CSS custom properties for a route-scoped public theme. Empty when the owner did not share a style. */
export function publicStyleProperties(style: PublicStyle | null): CSSProperties {
  if (!style) return {}
  const header = style.headerFontFamily
    ? fontStack(style.headerFontFamily)
    : FONT_FAMILY_CSS[DEFAULT_HEADER_FONT_FAMILY]
  const body = style.bodyFontFamily
    ? fontStack(style.bodyFontFamily)
    : FONT_FAMILY_CSS[DEFAULT_BODY_FONT_FAMILY]
  const cssVars = applyColorScheme(style.colorScheme, {
    headerFontFamily: header,
    bodyFontFamily: body,
  })
  if (style.borderRadius) cssVars["--radius"] = style.borderRadius
  return cssVars as CSSProperties
}

/** Application-default theme for guest preview when the owner does not share style. */
export function defaultPublicStyleProperties(): CSSProperties {
  return applyColorScheme(getDefaultColorScheme(), {
    headerFontFamily: FONT_FAMILY_CSS[DEFAULT_HEADER_FONT_FAMILY],
    bodyFontFamily: FONT_FAMILY_CSS[DEFAULT_BODY_FONT_FAMILY],
  }) as CSSProperties
}

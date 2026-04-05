"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { applyColorScheme, getDefaultColorScheme } from "@/lib/settings"
import { Theme } from "@/lib/types"
import {
  FONT_FAMILY_CSS,
  DEFAULT_BODY_FONT_FAMILY,
  DEFAULT_HEADER_FONT_FAMILY,
} from "@/lib/fonts"
import type { FontFamilyId } from "@/lib/fonts"

/** Auth and marketing pages: no account theme; reset document to built-in defaults. */
function shouldResetDocumentToDefaults(pathname: string): boolean {
  if (!pathname) return false
  if (pathname.startsWith("/auth/")) return true
  if (pathname === "/landing" || pathname.startsWith("/landing/")) return true
  return false
}

/** Shared public wishlist view at /wishlist/[token] — page applies owner colors/fonts. */
function isPublicWishlistSharePath(pathname: string): boolean {
  return pathname.startsWith("/wishlist/") && pathname !== "/wishlist"
}

/** Do not fetch /api/colors on these routes. */
function isExcludedFromAccountThemeFetch(pathname: string): boolean {
  return shouldResetDocumentToDefaults(pathname) || isPublicWishlistSharePath(pathname)
}

interface ThemeProviderProps {
  children: React.ReactNode
  attribute?: string
  defaultTheme?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
}

interface ColorsResponse {
  theme: Theme | null
  header_font_family: FontFamilyId
  body_font_family: FontFamilyId
}

export function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps) {
  const pathname = usePathname()
  const [customColors, setCustomColors] = useState<Theme | null>(null)
  const [headerFontFamily, setHeaderFontFamily] = useState<FontFamilyId>(
    DEFAULT_HEADER_FONT_FAMILY
  )
  const [bodyFontFamily, setBodyFontFamily] = useState<FontFamilyId>(DEFAULT_BODY_FONT_FAMILY)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isExcludedFromAccountThemeFetch(pathname)) {
      setCustomColors(null)
      setHeaderFontFamily(DEFAULT_HEADER_FONT_FAMILY)
      setBodyFontFamily(DEFAULT_BODY_FONT_FAMILY)
      setIsLoading(false)
      return
    }

    const loadUserTheme = async () => {
      try {
        const res = await fetch("/api/colors")
        const data: ColorsResponse = await res.json()
        if (data && typeof data === "object") {
          setCustomColors(data.theme ?? null)
          setHeaderFontFamily(data.header_font_family ?? DEFAULT_HEADER_FONT_FAMILY)
          setBodyFontFamily(data.body_font_family ?? DEFAULT_BODY_FONT_FAMILY)
        } else {
          setCustomColors(null)
          setHeaderFontFamily(DEFAULT_HEADER_FONT_FAMILY)
          setBodyFontFamily(DEFAULT_BODY_FONT_FAMILY)
        }
      } catch (error) {
        console.error("Error loading user theme:", error)
        setCustomColors(null)
        setHeaderFontFamily(DEFAULT_HEADER_FONT_FAMILY)
        setBodyFontFamily(DEFAULT_BODY_FONT_FAMILY)
      } finally {
        setIsLoading(false)
      }
    }

    loadUserTheme()
  }, [pathname])

  useEffect(() => {
    if (isLoading) return

    const root = document.documentElement

    if (isPublicWishlistSharePath(pathname)) {
      return
    }

    if (shouldResetDocumentToDefaults(pathname)) {
      Object.keys(applyColorScheme(getDefaultColorScheme())).forEach((property) => {
        root.style.removeProperty(property)
      })
      root.style.removeProperty("--font-sans")
      root.style.removeProperty("--font-heading")
      return
    }

    const headerCss = FONT_FAMILY_CSS[headerFontFamily]
    const bodyCss = FONT_FAMILY_CSS[bodyFontFamily]
    if (headerCss) root.style.setProperty("--font-heading", headerCss)
    if (bodyCss) root.style.setProperty("--font-sans", bodyCss)

    if (customColors) {
      const cssVars = applyColorScheme(customColors)
      Object.entries(cssVars).forEach(([property, value]) => {
        root.style.setProperty(property, value)
      })
      return () => {
        Object.keys(cssVars).forEach((property) => {
          root.style.removeProperty(property)
        })
      }
    }

    const defaultCssVars = applyColorScheme(getDefaultColorScheme())
    Object.keys(defaultCssVars).forEach((property) => {
      root.style.removeProperty(property)
    })
  }, [customColors, headerFontFamily, bodyFontFamily, isLoading, pathname])

  return <NextThemesProvider>{children}</NextThemesProvider>
}

/**
 * Apply custom colors for public wishlist view
 * This is used when viewing someone else's public wishlist
 */
export function applyPublicWishlistColors(colors: Theme | null) {
  if (!colors) return

  const cssVars = applyColorScheme(colors)
  const root = document.documentElement

  Object.entries(cssVars).forEach(([property, value]) => {
    root.style.setProperty(property, value)
  })

  return () => {
    Object.keys(cssVars).forEach((property) => {
      root.style.removeProperty(property)
    })
  }
}

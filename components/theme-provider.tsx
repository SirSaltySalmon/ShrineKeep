"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { createContext, useCallback, useContext, useEffect, useState } from "react"
import type { ComponentProps } from "react"
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
  if (pathname === "/") return true
  if (pathname.startsWith("/auth/")) return true
  if (pathname === "/landing" || pathname.startsWith("/landing/")) return true
  if (pathname === "/legal" || pathname.startsWith("/legal/")) return true
  return false
}

/** Shared public wishlist view at /wishlist/[token] — page applies owner colors/fonts. */
function isPublicWishlistSharePath(pathname: string): boolean {
  return pathname.startsWith("/wishlist/") && pathname !== "/wishlist"
}

/** Routes that never show the account theme: do not fetch /api/colors, and keep it off the document. */
function isExcludedFromAccountThemeFetch(pathname: string): boolean {
  return shouldResetDocumentToDefaults(pathname) || isPublicWishlistSharePath(pathname)
}

interface ColorsResponse {
  theme: Theme | null
  header_font_family: FontFamilyId
  body_font_family: FontFamilyId
}

export interface SavedAccountTheme {
  theme: Theme
  headerFontFamily: FontFamilyId
  bodyFontFamily: FontFamilyId
}

const AccountThemeSavedContext = createContext<(saved: SavedAccountTheme) => void>(() => {})

/**
 * Report a theme that was just saved. The provider only refetches on navigation, so without
 * this the next route would show the theme it loaded earlier until /api/colors answers.
 */
export function useAccountThemeSaved() {
  return useContext(AccountThemeSavedContext)
}

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
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

    // Marketing and auth pages use the built-in defaults; a shared wishlist scopes the owner's
    // style to its own subtree (PublicTheme). Either way nothing of the viewer's may stay on
    // <html>: not the saved theme, not an unsaved Settings preview, not the fonts.
    if (isExcludedFromAccountThemeFetch(pathname)) {
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

  const handleAccountThemeSaved = useCallback((saved: SavedAccountTheme) => {
    setCustomColors(saved.theme)
    setHeaderFontFamily(saved.headerFontFamily)
    setBodyFontFamily(saved.bodyFontFamily)
  }, [])

  return (
    <NextThemesProvider {...props}>
      <AccountThemeSavedContext.Provider value={handleAccountThemeSaved}>
        {children}
      </AccountThemeSavedContext.Provider>
    </NextThemesProvider>
  )
}

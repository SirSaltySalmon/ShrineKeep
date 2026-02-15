"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { applyColorScheme, getDefaultColorScheme } from "@/lib/settings"
import { Theme } from "@/lib/types"
import { FONT_FAMILY_CSS, DEFAULT_FONT_FAMILY } from "@/lib/fonts"
import type { FontFamilyId } from "@/lib/fonts"

/** Paths that must not use the account's custom theme (use default theme only). */
function isExcludedFromAccountTheme(pathname: string): boolean {
  if (!pathname) return false
  if (pathname.startsWith("/auth/")) return true
  if (pathname === "/landing" || pathname.startsWith("/landing/")) return true
  if (pathname.startsWith("/wishlist/") && pathname !== "/wishlist") return true
  return false
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
  font_family: FontFamilyId
}

export function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps) {
  const pathname = usePathname()
  const [customColors, setCustomColors] = useState<Theme | null>(null)
  const [fontFamily, setFontFamily] = useState<FontFamilyId>(DEFAULT_FONT_FAMILY)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (isExcludedFromAccountTheme(pathname)) {
      setCustomColors(null)
      setFontFamily(DEFAULT_FONT_FAMILY)
      setIsLoading(false)
      return
    }

    // Load user theme and font
    const loadUserTheme = async () => {
      try {
        const res = await fetch("/api/colors")
        const data: ColorsResponse = await res.json()
        if (data && typeof data === "object") {
          setCustomColors(data.theme ?? null)
          setFontFamily(data.font_family ?? DEFAULT_FONT_FAMILY)
        } else {
          setCustomColors(null)
          setFontFamily(DEFAULT_FONT_FAMILY)
        }
      } catch (error) {
        console.error("Error loading user theme:", error)
        setCustomColors(null)
        setFontFamily(DEFAULT_FONT_FAMILY)
      } finally {
        setIsLoading(false)
      }
    }

    loadUserTheme()
  }, [pathname])

  // Apply custom colors and font via CSS variables
  useEffect(() => {
    if (isLoading) return

    const root = document.documentElement

    if (isExcludedFromAccountTheme(pathname)) {
      Object.keys(applyColorScheme(getDefaultColorScheme())).forEach((property) => {
        root.style.removeProperty(property)
      })
      root.style.removeProperty("--font-sans")
      return
    }

    // Apply font
    const fontCss = FONT_FAMILY_CSS[fontFamily]
    if (fontCss) {
      root.style.setProperty("--font-sans", fontCss)
    }

    // Apply colors
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
    } else {
      const defaultCssVars = applyColorScheme(getDefaultColorScheme())
      Object.keys(defaultCssVars).forEach((property) => {
        root.style.removeProperty(property)
      })
    }
  }, [customColors, fontFamily, isLoading, pathname])

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

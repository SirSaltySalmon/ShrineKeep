"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { applyColorScheme, getDefaultColorScheme } from "@/lib/settings"
import { Theme } from "@/lib/types"
import { FONT_FAMILY_CSS, DEFAULT_FONT_FAMILY } from "@/lib/fonts"
import type { FontFamilyId } from "@/lib/fonts"

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
    // Don't apply custom colors on landing page or auth pages
    if (pathname === "/" || pathname.startsWith("/auth/")) {
      setCustomColors(null)
      setFontFamily(DEFAULT_FONT_FAMILY)
      setIsLoading(false)
      return
    }

    // Don't apply custom colors on public wishlist pages (they handle their own colors)
    if (pathname.startsWith("/wishlist/") && pathname !== "/wishlist") {
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

    // Don't apply on landing page or auth pages
    if (pathname === "/" || pathname.startsWith("/auth/")) {
      const defaultCssVars = applyColorScheme(getDefaultColorScheme())
      Object.keys(defaultCssVars).forEach((property) => {
        root.style.removeProperty(property)
      })
      root.style.removeProperty("--font-sans")
      return
    }

    if (pathname.startsWith("/wishlist/") && pathname !== "/wishlist") {
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

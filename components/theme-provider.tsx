"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { applyColorScheme, getDefaultColorScheme } from "@/lib/settings"
import { ColorScheme } from "@/lib/types"

interface ThemeProviderProps {
  children: React.ReactNode
  attribute?: string
  defaultTheme?: string
  enableSystem?: boolean
  disableTransitionOnChange?: boolean
}

export function ThemeProvider({
  children,
  ...props
}: ThemeProviderProps) {
  const pathname = usePathname()
  const [customColors, setCustomColors] = useState<ColorScheme | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Don't apply custom colors on landing page or auth pages
    if (pathname === "/" || pathname.startsWith("/auth/")) {
      setCustomColors(null)
      setIsLoading(false)
      return
    }

    // Don't apply custom colors on public wishlist pages (they handle their own colors)
    if (pathname.startsWith("/wishlist/") && pathname !== "/wishlist") {
      setCustomColors(null)
      setIsLoading(false)
      return
    }

    // Load user settings and apply custom colors
    const loadUserColors = async () => {
      try {
        const colors = await fetch("/api/colors")
        const data = await colors.json()
        if (data) {
          setCustomColors(data as ColorScheme)
        } else {
          setCustomColors(null)
        }
      } catch (error) {
        console.error("Error loading user colors:", error)
        setCustomColors(null)
      } finally {
        setIsLoading(false)
      }
    }

    loadUserColors()
  }, [pathname])

  // Apply custom colors via CSS variables
  useEffect(() => {
    if (isLoading) {
      return
    }

    // Don't apply colors on landing page or auth pages
    if (pathname === "/" || pathname.startsWith("/auth/")) {
      // Clear any existing custom colors
      const defaultCssVars = applyColorScheme(getDefaultColorScheme())
      const root = document.documentElement
      Object.keys(defaultCssVars).forEach((property) => {
        root.style.removeProperty(property)
      })
      return
    }

    // Skip public wishlist pages - they handle their own colors
    // Don't clear colors here to avoid flashing
    if (pathname.startsWith("/wishlist/") && pathname !== "/wishlist") {
      return
    }

    if (customColors) {
      const cssVars = applyColorScheme(customColors)
      const root = document.documentElement

      Object.entries(cssVars).forEach(([property, value]) => {
        root.style.setProperty(property, value)
      })

      // Cleanup function to reset on unmount
      return () => {
        Object.keys(cssVars).forEach((property) => {
          root.style.removeProperty(property)
        })
      }
    } else {
      // Clear colors if customColors is null
      const root = document.documentElement
      const defaultCssVars = applyColorScheme(getDefaultColorScheme())
      Object.keys(defaultCssVars).forEach((property) => {
        root.style.removeProperty(property)
      })
    }
  }, [customColors, isLoading, pathname])

  return <NextThemesProvider>{children}</NextThemesProvider>
}

/**
 * Apply custom colors for public wishlist view
 * This is used when viewing someone else's public wishlist
 */
export function applyPublicWishlistColors(colors: ColorScheme | null) {
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

"use client"

import { useLayoutEffect } from "react"
import { Item } from "@/lib/types"
import { Sparkle } from "lucide-react"
import ItemGrid from "@/components/item-grid"
import { applyColorScheme, getDefaultColorScheme } from "@/lib/settings"
import { Theme } from "@/lib/types"
import { SiteLogo } from "@/components/site-logo"
import {
  FONT_FAMILY_CSS,
  DEFAULT_BODY_FONT_FAMILY,
  DEFAULT_HEADER_FONT_FAMILY,
  type FontFamilyId,
} from "@/lib/fonts"

function fontStackForKey(key: string | null | undefined): string | undefined {
  if (!key) return undefined
  const css = FONT_FAMILY_CSS[key as FontFamilyId]
  return css
}

interface PublicWishlistClientProps {
  user: {
    id: string
    name?: string | null
    username?: string | null
  }
  items: Item[]
  applyColors: boolean
  colorScheme: Theme | null
  headerFontFamily: string | null
  bodyFontFamily: string | null
}

export default function PublicWishlistClient({
  user,
  items,
  applyColors,
  colorScheme,
  headerFontFamily,
  bodyFontFamily,
}: PublicWishlistClientProps) {
  useLayoutEffect(() => {
    const root = document.documentElement

    if (applyColors && colorScheme) {
      const cssVars = applyColorScheme(colorScheme)
      Object.entries(cssVars).forEach(([property, value]) => {
        root.style.setProperty(property, value)
      })

      const headerCss =
        fontStackForKey(headerFontFamily) ??
        FONT_FAMILY_CSS[DEFAULT_HEADER_FONT_FAMILY]
      const bodyCss =
        fontStackForKey(bodyFontFamily) ?? FONT_FAMILY_CSS[DEFAULT_BODY_FONT_FAMILY]
      root.style.setProperty("--font-heading", headerCss)
      root.style.setProperty("--font-sans", bodyCss)

      return () => {
        Object.keys(cssVars).forEach((property) => {
          root.style.removeProperty(property)
        })
        root.style.removeProperty("--font-sans")
        root.style.removeProperty("--font-heading")
      }
    }

    const defaultCssVars = applyColorScheme(getDefaultColorScheme())
    Object.keys(defaultCssVars).forEach((property) => {
      root.style.removeProperty(property)
    })
    root.style.removeProperty("--font-sans")
    root.style.removeProperty("--font-heading")
  }, [applyColors, colorScheme, headerFontFamily, bodyFontFamily])

  const displayName = user.name || user.username || "User"
  const pageTitle = `${displayName}'s Wishlist`

  return (
    <div className="min-h-screen bg-background min-w-0 overflow-hidden">
      <header className="border-b min-w-0">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 min-w-0">
          <div className="flex flex-row gap-2 items-center">
            <SiteLogo
              href="/landing"
              className="shrink-0 hover:opacity-90"
              iconClassName="h-8 w-8"
              textClassName="text-fluid-base font-semibold"
            />
            <a href="/landing">
            <span className="text-fluid-sm text-muted-foreground sm:text-left sm:max-w-xl sm:ml-auto truncate min-w-0">
              Want your own?
            </span>
            </a>
          </div>
          <h2 className="font-semibold text-foreground sm:text-right sm:max-w-xl sm:ml-auto truncate min-w-0">
            {pageTitle}
          </h2>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 min-w-0 overflow-hidden layout-shrink-visible">
        <h1 className="sr-only">{pageTitle}</h1>
        <ItemGrid
          items={items}
          currentBoxId={null}
          onItemUpdate={() => {}}
          sectionTitle="Wishlist"
          sectionIcon={Sparkle}
          variant="wishlist"
          readOnly
          showAddButton={false}
          emptyText="This wishlist is empty."
        />
      </main>
    </div>
  )
}

"use client"

import { useLayoutEffect } from "react"
import { Item } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Image as ImageIcon } from "lucide-react"
import ThumbnailImage from "@/components/thumbnail-image"
import { formatCurrency } from "@/lib/utils"
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b min-w-0">
        <div className="container mx-auto px-4 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 min-w-0">
          <SiteLogo
            href="/landing"
            className="shrink-0 hover:opacity-90"
            iconClassName="h-8 w-8"
            textClassName="text-fluid-base font-semibold"
          />
          <h1 className="text-fluid-2xl font-bold min-w-0 sm:text-right sm:max-w-xl sm:ml-auto truncate">
            {displayName}&apos;s Wishlist
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {items.length === 0 ? (
          <div className="text-center py-12 text-fluid-sm text-muted-foreground">
            This wishlist is empty.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <div className="relative w-full h-48 bg-muted overflow-hidden">
                  {item.thumbnail_url ? (
                    <ThumbnailImage
                      src={item.thumbnail_url}
                      alt={item.name}
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <CardHeader>
                  <CardTitle className="text-fluid-lg">
                    {item.name}
                  </CardTitle>
                  {item.description && (
                    <CardDescription className="line-clamp-2">
                      {item.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {item.expected_price && (
                    <div className="text-fluid-sm font-medium">
                      Expected: {formatCurrency(item.expected_price)}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

"use client"

import { useLayoutEffect } from "react"
import { Item } from "@/lib/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Image as ImageIcon } from "lucide-react"
import ThumbnailImage from "@/components/thumbnail-image"
import { formatCurrency } from "@/lib/utils"
import { applyColorScheme, getDefaultColorScheme } from "@/lib/settings"
import { Theme } from "@/lib/types"

interface PublicWishlistClientProps {
  user: {
    id: string
    name?: string | null
    username?: string | null
  }
  items: Item[]
  applyColors: boolean
  colorScheme: Theme | null
}

export default function PublicWishlistClient({
  user,
  items,
  applyColors,
  colorScheme,
}: PublicWishlistClientProps) {
  // Apply custom colors synchronously before paint to prevent flashing
  // useLayoutEffect runs synchronously after all DOM mutations but before paint
  useLayoutEffect(() => {
    const root = document.documentElement
    
    if (applyColors && colorScheme) {
      // Apply the wishlist owner's color scheme
      const cssVars = applyColorScheme(colorScheme)
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
      // Clear any custom colors and reset to default
      const defaultCssVars = applyColorScheme(getDefaultColorScheme())
      Object.keys(defaultCssVars).forEach((property) => {
        root.style.removeProperty(property)
      })
    }
  }, [applyColors, colorScheme])

  const displayName = user.name || user.username || "User"

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-fluid-2xl font-bold">
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

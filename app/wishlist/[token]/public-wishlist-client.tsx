"use client"

import { useLayoutEffect, useState } from "react"
import Link from "next/link"
import { Sparkle } from "lucide-react"
import { SiteLogo } from "@/components/site-logo"
import { Button } from "@/components/ui/button"
import ItemCard from "@/components/item-card"
import { READ_ONLY_CAPABILITIES, assertPublicCapabilities } from "@/lib/sharing/presentation/capabilities"
import { presentPublicWishlistItem } from "@/lib/sharing/presentation/adapters"
import type { CursorPage, PublicStyle, PublicWishlistItem } from "@/lib/sharing/contracts"
import { applyColorScheme } from "@/lib/settings"
import {
  FONT_FAMILY_CSS,
  DEFAULT_BODY_FONT_FAMILY,
  DEFAULT_HEADER_FONT_FAMILY,
  type FontFamilyId,
} from "@/lib/fonts"

function fontStackForKey(key: string | null | undefined): string | undefined {
  if (!key) return undefined
  return FONT_FAMILY_CSS[key as FontFamilyId]
}

interface PublicWishlistClientProps {
  token: string
  nickname: string
  items: PublicWishlistItem[]
  nextCursor: string | null
  hasMore: boolean
  sharedStyle: PublicStyle | null
}

export default function PublicWishlistClient({
  token,
  nickname,
  items: initialItems,
  nextCursor: initialCursor,
  hasMore: initialHasMore,
  sharedStyle,
}: PublicWishlistClientProps) {
  const capabilities = READ_ONLY_CAPABILITIES
  assertPublicCapabilities(capabilities)
  const [items, setItems] = useState(initialItems)
  const [nextCursor, setNextCursor] = useState(initialCursor)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [loadingMore, setLoadingMore] = useState(false)
  if (capabilities.canCopyToOwnDashboard) throw new Error("public token wishlist must stay read-only")

  useLayoutEffect(() => {
    const root = document.documentElement
    const scheme = sharedStyle?.colorScheme
    if (!scheme || Object.keys(scheme).length === 0) return

    const cssVars = applyColorScheme(scheme)
    const headerCss = fontStackForKey(sharedStyle.headerFontFamily) ?? FONT_FAMILY_CSS[DEFAULT_HEADER_FONT_FAMILY]
    const bodyCss = fontStackForKey(sharedStyle.bodyFontFamily) ?? FONT_FAMILY_CSS[DEFAULT_BODY_FONT_FAMILY]
    const properties = [...Object.keys(cssVars), "--font-heading", "--font-sans"]
    const previous = new Map(properties.map(property => [property, root.style.getPropertyValue(property)]))

    Object.entries(cssVars).forEach(([property, value]) => {
      root.style.setProperty(property, value)
    })
    root.style.setProperty("--font-heading", headerCss)
    root.style.setProperty("--font-sans", bodyCss)

    return () => {
      previous.forEach((value, property) => {
        if (value) root.style.setProperty(property, value)
        else root.style.removeProperty(property)
      })
    }
  }, [sharedStyle])

  async function loadMore() {
    if (!hasMore || !nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const response = await fetch(`/api/public/wishlist/${encodeURIComponent(token)}?cursor=${encodeURIComponent(nextCursor)}`, {
        cache: "no-store",
      })
      if (!response.ok) {
        setHasMore(false)
        setNextCursor(null)
        return
      }
      const page = await response.json() as CursorPage<PublicWishlistItem>
      setItems(current => [...current, ...page.entries])
      setNextCursor(page.nextCursor)
      setHasMore(page.hasMore)
    } finally {
      setLoadingMore(false)
    }
  }

  const pageTitle = `${nickname}'s Wishlist`

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
            <Link href="/landing">
              <span className="text-fluid-sm text-muted-foreground sm:text-left sm:max-w-xl sm:ml-auto truncate min-w-0">
                Want your own?
              </span>
            </Link>
          </div>
          <h2 className="font-semibold text-foreground sm:text-right sm:max-w-xl sm:ml-auto truncate min-w-0">
            {pageTitle}
          </h2>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 min-w-0 overflow-hidden layout-shrink-visible">
        <h1 className="sr-only">{pageTitle}</h1>
        <div className="rounded-md border bg-light-muted p-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4 min-w-0">
            <h2 className="text-fluid-xl font-semibold flex items-center min-w-0 truncate">
              <Sparkle className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
              Wishlist
            </h2>
          </div>
          {items.length === 0 ? (
            <p className="text-muted-foreground text-fluid-sm">This wishlist is empty.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 relative">
              {items.map(item => (
                <ItemCard
                  key={item.id}
                  item={presentPublicWishlistItem(item)}
                  variant="wishlist"
                  capabilities={capabilities}
                />
              ))}
            </div>
          )}
          {hasMore && nextCursor ? (
            <div className="mt-4 flex justify-center">
              <Button type="button" variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  )
}

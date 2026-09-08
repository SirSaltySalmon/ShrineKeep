"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Sparkle } from "lucide-react"
import { Button } from "@/components/ui/button"
import ItemCard from "@/components/item-card"
import { PublicItemDetailDialog } from "@/components/public-profile/item-detail-dialog"
import { ListState } from "@/components/social/list-state"
import { sharingKeys } from "@/lib/sharing/cache-keys"
import {
  fetchPublicWishlist,
  fetchPublicWishlistDetail,
  publicErrorMessage,
} from "@/lib/sharing/client/public-reads"
import { presentPublicItemDetail, presentPublicWishlistItem } from "@/lib/sharing/presentation/adapters"
import { publishedCapabilities, assertPublicCapabilities } from "@/lib/sharing/presentation/capabilities"
import { PUBLIC_EMPTY_COPY } from "@/lib/sharing/presentation/copy"
import type { PublicItemDetail, PublicWishlistItem, PublishedViewer } from "@/lib/sharing/contracts"
import type { PresentedItemDetail } from "@/lib/sharing/presentation/models"

const capabilities = publishedCapabilities(false)
assertPublicCapabilities(capabilities)

export function WishlistTab({
  ownerId,
  viewer,
  enabled,
}: {
  ownerId: string
  viewer: PublishedViewer
  enabled: boolean
}) {
  const queryClient = useQueryClient()
  const [detail, setDetail] = useState<PresentedItemDetail | null>(null)
  const [photosCursor, setPhotosCursor] = useState<string | null>(null)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const listKey = sharingKeys.public(ownerId, viewer, { surface: "wishlist" })
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => fetchPublicWishlist(ownerId),
    enabled,
  })

  async function openItem(item: PublicWishlistItem) {
    const loaded = await fetchPublicWishlistDetail(ownerId, item.id)
    setDetail(presentPublicItemDetail(loaded, presentPublicWishlistItem))
    setPhotosCursor(loaded.photos.nextCursor)
  }

  async function loadMorePhotos() {
    if (!detail || !photosCursor) return
    setLoadingPhotos(true)
    try {
      const loaded = await fetchPublicWishlistDetail(ownerId, detail.item.id, photosCursor)
      const next = presentPublicItemDetail(loaded as PublicItemDetail<PublicWishlistItem>, presentPublicWishlistItem)
      setDetail({ item: next.item, photos: [...detail.photos, ...next.photos] })
      setPhotosCursor(loaded.photos.nextCursor)
    } finally {
      setLoadingPhotos(false)
    }
  }

  const entries = list.data?.entries ?? []

  return (
    <div className="space-y-4">
      <h2 className="text-fluid-lg font-semibold flex items-center gap-2">
        <Sparkle className="h-4 w-4" />
        Wishlist
      </h2>
      <ListState
        loading={list.isLoading}
        error={list.error}
        empty={!list.isLoading && entries.length === 0}
        emptyText={PUBLIC_EMPTY_COPY}
        formatError={publicErrorMessage}
        onRetry={() => void list.refetch()}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {entries.map((item) => (
            <ItemCard
              key={item.id}
              item={presentPublicWishlistItem(item)}
              variant="wishlist"
              capabilities={capabilities}
              onClick={() => void openItem(item)}
            />
          ))}
        </div>
      </ListState>
      {list.data?.hasMore && list.data.nextCursor ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              const page = await fetchPublicWishlist(ownerId, list.data?.nextCursor)
              queryClient.setQueryData(listKey, {
                entries: [...entries, ...page.entries],
                nextCursor: page.nextCursor,
                hasMore: page.hasMore,
              })
            }}
          >
            Load more
          </Button>
        </div>
      ) : null}
      <PublicItemDetailDialog
        open={detail !== null}
        onOpenChange={(open) => { if (!open) setDetail(null) }}
        detail={detail}
        variant="wishlist"
        loadingMore={loadingPhotos}
        onLoadMorePhotos={photosCursor ? () => void loadMorePhotos() : undefined}
      />
    </div>
  )
}

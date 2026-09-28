"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Sparkle } from "lucide-react"
import { Button } from "@/components/ui/button"
import ItemCard from "@/components/item-card"
import { ListState } from "@/components/social/list-state"
import { sharingKeys } from "@/lib/sharing/cache-keys"
import { fetchPreviewWishlist, publicErrorMessage } from "@/lib/sharing/client/public-reads"
import { presentPublicWishlistItem } from "@/lib/sharing/presentation/adapters"
import { publishedCapabilities, assertPublicCapabilities } from "@/lib/sharing/presentation/capabilities"
import { PUBLIC_EMPTY_COPY } from "@/lib/sharing/presentation/copy"
import { defaultPublicStyleProperties } from "@/lib/sharing/presentation/style"

const capabilities = publishedCapabilities(false)
assertPublicCapabilities(capabilities)

export function GuestWishlistPreview({
  sessionOwnerId,
  profileShareStyle,
  visibleCount,
  totalCount,
  hasUnsavedSharingDraft,
}: {
  sessionOwnerId: string
  profileShareStyle: boolean
  visibleCount: number
  totalCount: number
  hasUnsavedSharingDraft: boolean
}) {
  const queryClient = useQueryClient()
  const listKey = sharingKeys.preview(sessionOwnerId, {})
  const list = useQuery({
    queryKey: listKey,
    queryFn: () => fetchPreviewWishlist(),
  })
  const entries = list.data?.entries ?? []
  const previewBody = (
    <div className="rounded-md border bg-light-muted p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-fluid-xl font-semibold flex items-center">
            <Sparkle className="h-4 w-4 sm:h-5 sm:w-5 mr-2 shrink-0" />
            Public preview
          </h2>
          <p className="text-fluid-sm text-muted-foreground">
            {visibleCount} of {totalCount} wishlist items are visible to guests. Per-container audiences control that number.
          </p>
          {hasUnsavedSharingDraft ? (
            <p className="text-fluid-sm text-muted-foreground">Preview uses saved settings.</p>
          ) : null}
        </div>
      </div>
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
              const page = await fetchPreviewWishlist(list.data?.nextCursor)
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
    </div>
  )

  if (profileShareStyle) return previewBody
  return (
    <div className="rounded-md" style={defaultPublicStyleProperties()}>
      {previewBody}
    </div>
  )
}

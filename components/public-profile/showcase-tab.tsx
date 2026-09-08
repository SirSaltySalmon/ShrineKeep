"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Package, Sparkle, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import BoxCard from "@/components/box-card"
import ItemCard from "@/components/item-card"
import { PublicBreadcrumbs } from "@/components/public-profile/public-breadcrumbs"
import { PublicBoxStatsDialog } from "@/components/public-profile/box-stats-dialog"
import { PublicItemDetailDialog } from "@/components/public-profile/item-detail-dialog"
import { ListState } from "@/components/social/list-state"
import { sharingKeys } from "@/lib/sharing/cache-keys"
import {
  emptyRootCollectionPage,
  fetchPublicBoxes,
  fetchPublicCollectionDetail,
  fetchPublicCollectionItems,
  publicErrorMessage,
} from "@/lib/sharing/client/public-reads"
import {
  presentPublicBox,
  presentPublicCollectionItem,
  presentPublicItemDetail,
} from "@/lib/sharing/presentation/adapters"
import { publishedCapabilities, assertPublicCapabilities } from "@/lib/sharing/presentation/capabilities"
import { PUBLIC_EMPTY_COPY } from "@/lib/sharing/presentation/copy"
import type { CursorPage, PublicBox, PublicCollectionItem, PublicItemDetail, PublishedViewer } from "@/lib/sharing/contracts"
import type { PresentedItemDetail } from "@/lib/sharing/presentation/models"

const capabilities = publishedCapabilities(false)
assertPublicCapabilities(capabilities)

interface ShowcaseTabProps {
  ownerId: string
  viewer: PublishedViewer
  enabled: boolean
}

export function ShowcaseTab({ ownerId, viewer, enabled }: ShowcaseTabProps) {
  const queryClient = useQueryClient()
  const [path, setPath] = useState<PublicBox[]>([])
  const [statsBox, setStatsBox] = useState<{ id: string | null; name: string } | null>(null)
  const [detail, setDetail] = useState<PresentedItemDetail | null>(null)
  const [photosCursor, setPhotosCursor] = useState<string | null>(null)
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const parentId = path.at(-1)?.id
  const boxesKey = sharingKeys.public(ownerId, viewer, { surface: "boxes", boxId: parentId })
  const itemsKey = sharingKeys.public(ownerId, viewer, { surface: "items", boxId: parentId })

  const boxes = useQuery({
    queryKey: boxesKey,
    queryFn: () => fetchPublicBoxes(ownerId, { parentId }),
    enabled,
  })
  const items = useQuery({
    queryKey: itemsKey,
    queryFn: async () => {
      try {
        return await fetchPublicCollectionItems(ownerId, { boxId: parentId })
      } catch (error) {
        const empty = emptyRootCollectionPage(error, parentId)
        if (empty) return empty
        throw error
      }
    },
    enabled,
  })

  async function loadMore<T>(
    key: ReturnType<typeof sharingKeys.public>,
    current: CursorPage<T> | undefined,
    fetchPage: (cursor: string) => Promise<CursorPage<T>>,
  ) {
    if (!current?.hasMore || !current.nextCursor) return
    const page = await fetchPage(current.nextCursor)
    queryClient.setQueryData(key, {
      entries: [...current.entries, ...page.entries],
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    })
  }

  async function openItem(item: PublicCollectionItem) {
    const loaded = await fetchPublicCollectionDetail(ownerId, item.id)
    setDetail(presentPublicItemDetail(loaded, presentPublicCollectionItem))
    setPhotosCursor(loaded.photos.nextCursor)
  }

  async function loadMorePhotos() {
    if (!detail || !photosCursor) return
    setLoadingPhotos(true)
    try {
      const loaded = await fetchPublicCollectionDetail(ownerId, detail.item.id, photosCursor)
      const next = presentPublicItemDetail(loaded as PublicItemDetail<PublicCollectionItem>, presentPublicCollectionItem)
      setDetail({
        item: next.item,
        photos: [...detail.photos, ...next.photos],
      })
      setPhotosCursor(loaded.photos.nextCursor)
    } finally {
      setLoadingPhotos(false)
    }
  }

  const boxEntries = boxes.data?.entries ?? []
  const itemEntries = items.data?.entries ?? []
  const empty = !boxes.isLoading && !items.isLoading && !boxEntries.length && !itemEntries.length
  const error = boxes.error ?? items.error

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PublicBreadcrumbs
          path={path}
          onRoot={() => setPath([])}
          onSelect={(index) => setPath(path.slice(0, index + 1))}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="View collection graphs"
          onClick={() => setStatsBox({ id: parentId ?? null, name: path.at(-1)?.name ?? "Collection" })}
        >
          <TrendingUp className="h-4 w-4" />
        </Button>
      </div>

      <ListState
        loading={boxes.isLoading || items.isLoading}
        error={error}
        empty={empty}
        emptyText={PUBLIC_EMPTY_COPY}
        formatError={publicErrorMessage}
        onRetry={() => {
          void boxes.refetch()
          void items.refetch()
        }}
      >
        <div className="space-y-6">
          {boxEntries.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-fluid-lg font-semibold flex items-center gap-2">
                <Package className="h-4 w-4" />
                Boxes
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {boxEntries.map((box) => (
                  <BoxCard
                    key={box.id}
                    box={presentPublicBox(box)}
                    capabilities={capabilities}
                    onBoxClick={() => setPath([...path, box])}
                    onShowStats={() => setStatsBox({ id: box.id, name: box.name })}
                  />
                ))}
              </div>
              {boxes.data?.hasMore && boxes.data.nextCursor ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void loadMore(boxesKey, boxes.data, (cursor) => fetchPublicBoxes(ownerId, { parentId, cursor }))}
                  >
                    Load more
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {itemEntries.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-fluid-lg font-semibold flex items-center gap-2">
                <Sparkle className="h-4 w-4" />
                Items
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {itemEntries.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={presentPublicCollectionItem(item)}
                    variant="collection"
                    capabilities={capabilities}
                    onClick={() => void openItem(item)}
                  />
                ))}
              </div>
              {items.data?.hasMore && items.data.nextCursor ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void loadMore(itemsKey, items.data, (cursor) => fetchPublicCollectionItems(ownerId, { boxId: parentId, cursor }))}
                  >
                    Load more
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </ListState>

      <PublicBoxStatsDialog
        open={statsBox !== null}
        onOpenChange={(open) => { if (!open) setStatsBox(null) }}
        ownerId={ownerId}
        viewer={viewer}
        boxId={statsBox?.id ?? null}
        boxName={statsBox?.name ?? "Collection"}
      />
      <PublicItemDetailDialog
        open={detail !== null}
        onOpenChange={(open) => { if (!open) setDetail(null) }}
        detail={detail}
        variant="collection"
        loadingMore={loadingPhotos}
        onLoadMorePhotos={photosCursor ? () => void loadMorePhotos() : undefined}
      />
    </div>
  )
}

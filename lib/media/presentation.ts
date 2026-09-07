import type { Item } from "@/lib/types"

/** Delivery URLs are presentation-only; never persist them in photo/form records. */
export function ownerPhotoSource(photo: { id?: string; url: string }): string {
  return photo.id ? `/api/media/photo/${encodeURIComponent(photo.id)}?image=1` : photo.url
}

export function ownerThumbnailSource(item: Pick<Item, "photos" | "thumbnail_url">): string | undefined {
  const photo = item.photos?.find(photo => photo.is_thumbnail)
    ?? item.photos?.find(photo => photo.url === item.thumbnail_url)
  return photo ? ownerPhotoSource(photo) : item.thumbnail_url
}

export interface ItemFormPhoto {
  id?: string
  url: string
  storage_path?: string | null
  is_thumbnail: boolean
}

export interface ItemFormSnapshot {
  name: string
  description: string | null
  current_value: number | null
  acquisition_date: string | null
  acquisition_price: number | null
  expected_price: number | null
  thumbnail_url: string | null
  box_id: string | null
  wishlist_target_box_id: string | null
  is_wishlist: boolean
  photos: ItemFormPhoto[]
  tag_ids: string[]
}

export interface ItemPhotoOps {
  create?: Array<{ url: string; storage_path?: string | null; is_thumbnail: boolean }>
  update?: Array<{
    id: string
    is_thumbnail?: boolean
    url?: string
    storage_path?: string | null
  }>
  delete?: string[]
}

export interface ItemPatch {
  id: string
  name?: string
  description?: string | null
  current_value?: number | null
  acquisition_date?: string | null
  acquisition_price?: number | null
  expected_price?: number | null
  thumbnail_url?: string | null
  box_id?: string | null
  wishlist_target_box_id?: string | null
  is_wishlist?: boolean
  photos?: ItemPhotoOps
  tag_ids?: string[]
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed === "" ? null : trimmed
}

function normalizeNumber(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null
  return value
}

function normalizeStoragePath(path: string | null | undefined): string | null {
  if (path == null || path === "") return null
  return path
}

function photosEqual(a: ItemFormPhoto, b: ItemFormPhoto): boolean {
  return (
    a.url === b.url &&
    a.is_thumbnail === b.is_thumbnail &&
    normalizeStoragePath(a.storage_path) === normalizeStoragePath(b.storage_path)
  )
}

function tagSetsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const bSet = new Set(b)
  return a.every((id) => bSet.has(id))
}

/** Canonical form snapshot for diffing. */
export function buildItemFormSnapshot(input: {
  name: string
  description?: string | null
  current_value?: number | null
  acquisition_date?: string | null
  acquisition_price?: number | null
  expected_price?: number | null
  thumbnail_url?: string | null
  box_id?: string | null
  wishlist_target_box_id?: string | null
  is_wishlist: boolean
  photos: ItemFormPhoto[]
  tag_ids: string[]
}): ItemFormSnapshot {
  return {
    name: input.name.trim(),
    description: emptyToNull(input.description),
    current_value: normalizeNumber(input.current_value),
    acquisition_date: emptyToNull(input.acquisition_date),
    acquisition_price: normalizeNumber(input.acquisition_price),
    expected_price: normalizeNumber(input.expected_price),
    thumbnail_url: emptyToNull(input.thumbnail_url),
    box_id: emptyToNull(input.box_id),
    wishlist_target_box_id: emptyToNull(input.wishlist_target_box_id),
    is_wishlist: input.is_wishlist,
    photos: input.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      storage_path: normalizeStoragePath(photo.storage_path),
      is_thumbnail: photo.is_thumbnail,
    })),
    tag_ids: [...input.tag_ids],
  }
}

const SCALAR_KEYS = [
  "name",
  "description",
  "current_value",
  "acquisition_date",
  "acquisition_price",
  "expected_price",
  "thumbnail_url",
  "box_id",
  "wishlist_target_box_id",
  "is_wishlist",
] as const

function diffPhotos(baseline: ItemFormPhoto[], current: ItemFormPhoto[]): ItemPhotoOps | undefined {
  const baselineById = new Map<string, ItemFormPhoto>()
  for (const photo of baseline) {
    if (photo.id) baselineById.set(photo.id, photo)
  }

  const currentIds = new Set<string>()
  const create: NonNullable<ItemPhotoOps["create"]> = []
  const update: NonNullable<ItemPhotoOps["update"]> = []

  for (const photo of current) {
    if (!photo.id || !baselineById.has(photo.id)) {
      create.push({
        url: photo.url,
        storage_path: normalizeStoragePath(photo.storage_path),
        is_thumbnail: photo.is_thumbnail,
      })
      continue
    }
    currentIds.add(photo.id)
    const previous = baselineById.get(photo.id)!
    if (photosEqual(previous, photo)) continue
    const patch: NonNullable<ItemPhotoOps["update"]>[number] = { id: photo.id }
    if (previous.is_thumbnail !== photo.is_thumbnail) patch.is_thumbnail = photo.is_thumbnail
    if (previous.url !== photo.url) patch.url = photo.url
    if (normalizeStoragePath(previous.storage_path) !== normalizeStoragePath(photo.storage_path)) {
      patch.storage_path = normalizeStoragePath(photo.storage_path)
    }
    update.push(patch)
  }

  const deleteIds = baseline
    .map((photo) => photo.id)
    .filter((id): id is string => !!id && !currentIds.has(id))

  const ops: ItemPhotoOps = {}
  if (create.length > 0) ops.create = create
  if (update.length > 0) ops.update = update
  if (deleteIds.length > 0) ops.delete = deleteIds
  return Object.keys(ops).length > 0 ? ops : undefined
}

/**
 * Diff two item form snapshots into a sparse PATCH body.
 * Returns null when nothing changed.
 */
export function diffItemPatch(
  baseline: ItemFormSnapshot,
  current: ItemFormSnapshot,
  itemId: string
): ItemPatch | null {
  const patch: ItemPatch = { id: itemId }

  for (const key of SCALAR_KEYS) {
    if (baseline[key] !== current[key]) {
      Object.assign(patch, { [key]: current[key] })
    }
  }

  const photos = diffPhotos(baseline.photos, current.photos)
  if (photos) patch.photos = photos

  if (!tagSetsEqual(baseline.tag_ids, current.tag_ids)) {
    patch.tag_ids = [...current.tag_ids]
  }

  const keys = Object.keys(patch).filter((key) => key !== "id")
  return keys.length === 0 ? null : patch
}

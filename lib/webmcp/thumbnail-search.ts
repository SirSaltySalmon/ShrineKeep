import type { ApprovedCreatedItem } from "@/lib/webmcp/types"

type FetchImageSearch = (input: string, init?: RequestInit) => Promise<Response>

const DEFAULT_SEARCH_CONCURRENCY = 4

function firstWebImage(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("images" in value)) return null
  const images = (value as { images?: unknown }).images
  if (!Array.isArray(images)) return null

  for (const candidate of images) {
    if (typeof candidate !== "string") continue
    try {
      const url = new URL(candidate)
      if (url.protocol === "http:" || url.protocol === "https:") return url.toString()
    } catch {
      // Ignore malformed provider results and try the next image.
    }
  }

  return null
}

/**
 * Search through the same authenticated endpoint used by the item image picker,
 * then attach the first usable result as both the photo and thumbnail.
 * Search failures are best-effort so optional image search cannot block creation.
 */
export async function addFirstImageThumbnails(
  items: ApprovedCreatedItem[],
  fetchImageSearch: FetchImageSearch = fetch,
  concurrency = DEFAULT_SEARCH_CONCURRENCY
): Promise<ApprovedCreatedItem[]> {
  if (items.length === 0) return []

  const enriched = items.map((item) => ({ ...item }))
  let nextIndex = 0

  const searchNext = async () => {
    while (nextIndex < enriched.length) {
      const index = nextIndex
      nextIndex += 1
      const item = enriched[index]!

      try {
        const response = await fetchImageSearch(
          `/api/images/search?q=${encodeURIComponent(item.name)}`
        )
        if (!response.ok) continue
        const imageUrl = firstWebImage(await response.json())
        if (!imageUrl) continue

        enriched[index] = {
          ...item,
          photos: [{ url: imageUrl, is_thumbnail: true }],
        }
      } catch {
        // The image feature is optional; preserve an image-less item on failure.
      }
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), enriched.length)
  await Promise.all(Array.from({ length: workerCount }, () => searchNext()))
  return enriched
}

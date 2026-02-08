import { NextRequest, NextResponse } from "next/server"

/**
 * SerpAPI image search proxy (google_images_light engine).
 * Light engine returns minimal data (thumbnails/URLs only)—sufficient for picking a thumbnail.
 * Keeps SERPAPI_API_KEY server-side; client calls this route with ?q=query.
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "SerpAPI is not configured. Add SERPAPI_API_KEY to .env.local." },
      { status: 503 }
    )
  }

  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")
  if (!q?.trim()) {
    return NextResponse.json(
      { error: "Missing search query (q)." },
      { status: 400 }
    )
  }

  try {
    const params = new URLSearchParams({
      engine: "google_images_light",
      q: q.trim(),
      api_key: apiKey,
      num: "20",
    })
    const res = await fetch(`https://serpapi.com/search?${params.toString()}`, {
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: `SerpAPI error: ${res.status}`, details: text.slice(0, 200) },
        { status: 502 }
      )
    }

    const data = (await res.json()) as {
      image_results?: Array<Record<string, unknown>>
      images_results?: Array<Record<string, unknown>>
      error?: string
    }

    if (data.error) {
      return NextResponse.json(
        { error: data.error },
        { status: 502 }
      )
    }

    // SerpAPI light API uses "images_results"; full API uses "image_results"
    const imageResults =
      data.images_results ?? data.image_results ?? []
    const allUrls = imageResults
      .map((item) => {
        const raw = item.original ?? item.thumbnail ?? item.link
        return typeof raw === "string" ? raw : null
      })
      .filter((url): url is string => url != null && url.length > 0)

    const urls = allUrls.slice(0, 20)

    if (urls.length === 0 && process.env.NODE_ENV === "development") {
      console.warn(
        "[images/search] No image URLs extracted. Response keys:",
        Object.keys(data),
        "first result keys:",
        imageResults[0] ? Object.keys(imageResults[0]) : "no results"
      )
    }

    return NextResponse.json({ images: urls })
  } catch (err) {
    console.error("SerpAPI image search error:", err)
    return NextResponse.json(
      { error: "Image search failed. Please try again." },
      { status: 500 }
    )
  }
}

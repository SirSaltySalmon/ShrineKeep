import { NextRequest, NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import {
  captureRouteException,
  captureRouteMessage,
  startRouteSpan,
} from "@/lib/monitoring/sentry"

/**
 * SerpAPI image search proxy (google_images_light engine).
 * Light engine returns minimal data (thumbnails/URLs only)—sufficient for picking a thumbnail.
 * Keeps SERPAPI_API_KEY server-side; requires authentication.
 */
export async function GET(request: NextRequest) {
  let userId: string | null = null
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  userId = user?.id ?? null

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const apiKey = process.env.SERPAPI_API_KEY
  if (!apiKey) {
    captureRouteMessage(
      "Missing SERPAPI_API_KEY configuration",
      {
        area: "images",
        route: "/api/images/search",
        userId,
        tags: {
          operation: "search_images",
        },
      },
      "error"
    )
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
    const res = await startRouteSpan(
      "images.search.serpapi_request",
      "http.client",
      {
        "feature.area": "images",
        "feature.operation": "search_images",
      },
      () =>
        fetch(`https://serpapi.com/search?${params.toString()}`, {
          next: { revalidate: 0 },
        })
    )

    if (!res.ok) {
      const text = await res.text()
      captureRouteMessage("SerpAPI returned non-OK response", {
        area: "images",
        route: "/api/images/search",
        userId,
        tags: {
          operation: "search_images",
          http_status: res.status,
        },
        extra: {
          details_preview: text.slice(0, 200),
        },
      })
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
      captureRouteMessage("SerpAPI payload contains error", {
        area: "images",
        route: "/api/images/search",
        userId,
        tags: {
          operation: "search_images",
        },
        extra: {
          provider_error: data.error,
        },
      })
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
    captureRouteException(err, {
      area: "images",
      route: "/api/images/search",
      userId,
      tags: {
        operation: "search_images",
      },
    })
    return NextResponse.json(
      { error: "Image search failed. Please try again." },
      { status: 500 }
    )
  }
}

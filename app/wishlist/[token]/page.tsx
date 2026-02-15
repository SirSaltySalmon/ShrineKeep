import { headers } from "next/headers"
import NotFound from "@/app/not-found"
import PublicWishlistClient from "./public-wishlist-client"

interface PublicWishlistPageProps {
  params: Promise<{ token: string }>
}

export default async function PublicWishlistPage(
  props: PublicWishlistPageProps
) {
  const params = await props.params
  const { token } = params

  if (!token) {
    return <NotFound />
  }

  // Use the request host so the same origin is used (works for www vs non-www and any domain)
  const headersList = await headers()
  const host = headersList.get("host") ?? "localhost:3000"
  const proto = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const baseUrl = `${proto}://${host}`

  let data
  try {
    const response = await fetch(`${baseUrl}/api/wishlist/${token}`, {
      cache: "no-store", // Ensure fresh data
    })

    if (!response.ok) {
      return <NotFound />
    }

    data = await response.json()
  } catch (error) {
    console.error("Error fetching wishlist from API:", error)
    return <NotFound />
  }

  // Ensure user object has required fields
  const user = data.user || { id: "", name: null, username: null }

  return (
    <PublicWishlistClient
      user={user}
      items={data.items || []}
      applyColors={data.applyColors}
      colorScheme={data.colorScheme}
    />
  )
}

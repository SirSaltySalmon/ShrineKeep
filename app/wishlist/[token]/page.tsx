import { notFound } from "next/navigation"
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
    notFound()
  }

  // Fetch wishlist data from API route
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  
  let data
  try {
    const response = await fetch(`${baseUrl}/api/wishlist/${token}`, {
      cache: "no-store", // Ensure fresh data
    })

    if (!response.ok) {
      notFound()
    }

    data = await response.json()
  } catch (error) {
    console.error("Error fetching wishlist from API:", error)
    notFound()
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

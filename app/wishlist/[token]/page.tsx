import NotFound from "@/app/not-found"
import { loadTokenWishlistPage } from "@/lib/sharing/server/http"
import PublicWishlistClient from "./public-wishlist-client"

interface PublicWishlistPageProps {
  params: Promise<{ token: string }>
}

export default async function PublicWishlistPage(props: PublicWishlistPageProps) {
  const { token } = await props.params
  if (!token) return <NotFound />

  const loaded = await loadTokenWishlistPage(token)
  if (!loaded.ok) return <NotFound />

  return (
    <PublicWishlistClient
      token={token}
      nickname={loaded.profile.nickname}
      items={loaded.page.entries}
      nextCursor={loaded.page.nextCursor}
      hasMore={loaded.page.hasMore}
      sharedStyle={loaded.profile.sharedStyle}
    />
  )
}

import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { loadPublicProfilePage } from "@/lib/sharing/server/http"
import { publicProfileMetadata } from "@/lib/sharing/public-metadata"
import PublicProfileClient from "./public-profile-client"

interface PublicProfilePageProps {
  params: Promise<{ userId: string }>
}

export async function generateMetadata(props: PublicProfilePageProps): Promise<Metadata> {
  const { userId } = await props.params
  const loaded = await loadPublicProfilePage(userId)
  if (!loaded.ok) return publicProfileMetadata(null)
  return publicProfileMetadata(loaded.profile)
}

export default async function PublicProfilePage(props: PublicProfilePageProps) {
  const { userId } = await props.params
  if (!userId) notFound()

  const loaded = await loadPublicProfilePage(userId)
  if (!loaded.ok) {
    if (loaded.reason === "authentication_required") {
      redirect(`/auth/login?next=${encodeURIComponent(`/users/${userId}`)}`)
    }
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <PublicProfileClient
        profile={loaded.profile}
        viewer={loaded.viewer}
        viewerName={loaded.viewerName}
        sandbox={loaded.sandbox}
        socialMutationsEnabled={loaded.socialMutationsEnabled}
      />
    </Suspense>
  )
}

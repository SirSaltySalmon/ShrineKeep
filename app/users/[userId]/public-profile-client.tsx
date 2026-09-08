"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PublicNav } from "@/components/public-profile/public-nav"
import { PublicTheme } from "@/components/public-profile/public-theme"
import { ProfileHeader } from "@/components/public-profile/profile-header"
import { ShowcaseTab } from "@/components/public-profile/showcase-tab"
import { WishlistTab } from "@/components/public-profile/wishlist-tab"
import type { PublicProfile, PublishedViewer } from "@/lib/sharing/contracts"

interface PublicProfileClientProps {
  profile: PublicProfile
  viewer: PublishedViewer
  viewerName: string | null
  sandbox: boolean
  socialMutationsEnabled: boolean
}

export default function PublicProfileClient({
  profile,
  viewer,
  viewerName,
  sandbox,
  socialMutationsEnabled,
}: PublicProfileClientProps) {
  const searchParams = useSearchParams()
  const requested = searchParams.get("tab")
  const [tab, setTab] = useState(requested === "wishlist" ? "wishlist" : "showcase")
  const [opened, setOpened] = useState<Record<string, boolean>>({
    showcase: tab === "showcase",
    wishlist: tab === "wishlist",
  })

  function selectTab(next: string) {
    setTab(next)
    setOpened((current) => ({ ...current, [next]: true }))
  }

  return (
    <PublicTheme style={profile.sharedStyle}>
      <PublicNav
        viewerName={viewerName}
        sandbox={sandbox}
        loginHref={`/auth/login?next=${encodeURIComponent(`/users/${profile.id}`)}`}
      />
      <main className="container mx-auto px-4 py-8 min-w-0 space-y-6">
        <ProfileHeader
          profile={profile}
          viewer={viewer}
          sandbox={sandbox}
          socialMutationsEnabled={socialMutationsEnabled}
        />
        <Tabs value={tab} onValueChange={selectTab}>
          <TabsList>
            <TabsTrigger value="showcase">Showcase</TabsTrigger>
            <TabsTrigger value="wishlist">Wishlist</TabsTrigger>
          </TabsList>
          <TabsContent value="showcase">
            {opened.showcase ? (
              <ShowcaseTab ownerId={profile.id} viewer={viewer} enabled={tab === "showcase"} />
            ) : null}
          </TabsContent>
          <TabsContent value="wishlist">
            {opened.wishlist ? (
              <WishlistTab ownerId={profile.id} viewer={viewer} enabled={tab === "wishlist"} />
            ) : null}
          </TabsContent>
        </Tabs>
      </main>
    </PublicTheme>
  )
}

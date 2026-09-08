"use client"

import type { PublicProfile, PublishedViewer } from "@/lib/sharing/contracts"
import { RelationshipControls } from "@/components/public-profile/relationship-controls"

export function ProfileHeader({
  profile,
  viewer,
  sandbox,
  socialMutationsEnabled,
}: {
  profile: PublicProfile
  viewer: PublishedViewer
  sandbox: boolean
  socialMutationsEnabled: boolean
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {profile.avatar?.url ? (
          <img
            src={profile.avatar.url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-md object-cover bg-light-muted"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-light-muted text-fluid-xl text-foreground"
            aria-hidden
          >
            {Array.from(profile.nickname.trim() || "?")[0]?.toUpperCase() ?? "?"}
          </span>
        )}
        <div className="min-w-0 space-y-1">
          <h1 className="text-fluid-2xl font-heading font-semibold text-foreground truncate">{profile.nickname}</h1>
          {profile.bio.trim() ? (
            <p className="text-fluid-sm text-muted-foreground whitespace-pre-wrap break-words">{profile.bio}</p>
          ) : null}
        </div>
      </div>
      <RelationshipControls
        ownerId={profile.id}
        label={profile.nickname}
        relationship={profile.relationship}
        viewer={viewer}
        sandbox={sandbox}
        socialMutationsEnabled={socialMutationsEnabled}
      />
    </header>
  )
}

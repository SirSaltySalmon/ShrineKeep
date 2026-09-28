import type { PublicProfile } from "./contracts"

/** Safe document metadata. Never include email, tokens, unsigned paths, or a denied profile's identity. */
export function publicProfileMetadata(profile: PublicProfile | null) {
  if (!profile) {
    return {
      title: "ShrineKeep",
      description: "A collection on ShrineKeep.",
    }
  }
  const title = `${profile.nickname} · ShrineKeep`
  const description = profile.bio.trim() || `${profile.nickname}'s collection on ShrineKeep`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
    },
  }
}

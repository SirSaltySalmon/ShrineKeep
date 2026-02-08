"use client"

import Image from "next/image"

/**
 * Renders a thumbnail: uses next/Image for Supabase storage URLs (optimized),
 * native <img> for external URLs (e.g. from image search) so we don't need to
 * whitelist every host in next.config.js.
 */
export default function ThumbnailImage({
  src,
  alt,
  className = "object-cover",
}: {
  src: string
  alt: string
  className?: string
}) {
  const isSupabase = src.includes("supabase.co")

  if (isSupabase) {
    return <Image src={src} alt={alt} fill className={className} />
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      referrerPolicy="no-referrer"
    />
  )
}

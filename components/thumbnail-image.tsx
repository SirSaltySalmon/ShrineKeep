"use client"

/** Native delivery preserves session cookies and avoids caching private media in the optimizer. */
export default function ThumbnailImage({
  src,
  alt,
  className = "object-cover",
  fill = true,
}: {
  src: string
  alt: string
  className?: string
  /** Fill the positioned parent. Set false to size the image to its own box (uncropped contain views). */
  fill?: boolean
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined}
      referrerPolicy="no-referrer"
    />
  )
}

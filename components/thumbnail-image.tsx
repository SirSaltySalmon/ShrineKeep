"use client"

/** Native delivery preserves session cookies and avoids caching private media in the optimizer. */
export default function ThumbnailImage({
  src,
  alt,
  className = "object-cover",
}: {
  src: string
  alt: string
  className?: string
}) {
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

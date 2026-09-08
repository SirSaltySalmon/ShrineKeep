import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("public item detail dialog photos", () => {
  const src = readFileSync(
    fileURLToPath(new URL("./item-detail-dialog.tsx", import.meta.url)),
    "utf8",
  )

  it("shows the selected photo uncropped in the dialog and opens the gallery on click", () => {
    expect(src).toContain('aria-label="View full picture"')
    expect(src).toContain("fill={false}")
    expect(src).toContain("object-contain")
    expect(src).not.toContain("h-56")
    expect(src).not.toMatch(/ThumbnailImage[^>]*className="object-cover"/)
    expect(src).toContain("<ImageGalleryCarousel")
    expect(src).toContain("initialIndex={photoIndex}")
  })

  it("keeps the fullscreen gallery outside the item dialog", () => {
    const galleryIndex = src.indexOf("<ImageGalleryCarousel")
    const dialogCloseIndex = src.lastIndexOf("</Dialog>")
    expect(galleryIndex).toBeGreaterThan(-1)
    expect(dialogCloseIndex).toBeGreaterThan(-1)
    expect(galleryIndex).toBeGreaterThan(dialogCloseIndex)
  })
})

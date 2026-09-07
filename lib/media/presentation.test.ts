import { describe, expect, it } from "vitest"
import { ownerPhotoSource, ownerThumbnailSource } from "./presentation"

describe("owner media presentation", () => {
  it("does not reuse a persisted bearer URL for saved photos", () => {
    const photo = { id: "photo-id", url: "https://storage.test/old?token=secret" }
    expect(ownerPhotoSource(photo)).toBe("/api/media/photo/photo-id?image=1")
    expect(photo.url).toContain("token=secret")
  })
  it("keeps unsaved previews and external-only legacy thumbnails usable", () => {
    expect(ownerPhotoSource({ url: "blob:preview" })).toBe("blob:preview")
    expect(ownerThumbnailSource({ thumbnail_url: "https://external.test/a" })).toBe("https://external.test/a")
  })
})

/** Browser helper: server chooses the object path; the client only PUTs to the signed URL. */
export async function uploadOwnedMedia(file: File, kind: "photo" | "avatar"): Promise<{
  assetId: string
  objectPath: string
  publicUrl?: string | null
}> {
  const prepared = await fetch("/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phase: "prepare",
      kind,
      mime: file.type,
      byteSize: file.size,
    }),
  })
  if (!prepared.ok) throw new Error("Failed to start upload")
  const target = await prepared.json() as {
    assetId: string
    objectPath: string
    signedUrl: string
    token: string
  }
  const uploaded = await fetch(target.signedUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  })
  if (!uploaded.ok) {
    await fetch("/api/media/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase: "discard", kind, assetId: target.assetId }),
    }).catch(() => undefined)
    throw new Error("Failed to upload file")
  }
  const completed = await fetch("/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phase: "complete", kind, assetId: target.assetId }),
  })
  if (!completed.ok) throw new Error("Failed to finalize upload")
  const ready = await completed.json() as { assetId: string; objectPath: string; publicUrl?: string | null }
  return {
    assetId: ready.assetId,
    objectPath: ready.objectPath,
    publicUrl: ready.publicUrl,
  }
}

export async function discardOwnedMedia(assetIds: string[]): Promise<void> {
  await Promise.all(assetIds.map((assetId) => fetch("/api/media/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phase: "discard", kind: "photo", assetId }),
  })))
}

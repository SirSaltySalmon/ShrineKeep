export interface GcDependencies {
  rpc(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<{ data: unknown; error: unknown }>
  remove(bucket: string, objectPath: string, signal: AbortSignal): Promise<{ error: unknown }>
}

interface Claim { id: string; bucket: string; objectPath: string; claimToken: string }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function claims(value: unknown): Claim[] {
  const envelope = record(value)
  const assets = record(envelope?.data)?.assets
  if (envelope?.ok !== true || !Array.isArray(assets) || assets.length > 4) throw new Error("invalid_claim")
  return assets.map(value => {
    const asset = record(value)
    if (!asset || typeof asset.id !== "string" || !uuid.test(asset.id)
      || typeof asset.claimToken !== "string" || !uuid.test(asset.claimToken)
      || (asset.bucket !== "item-photos" && asset.bucket !== "avatars")
      || typeof asset.objectPath !== "string" || asset.objectPath.length > 512
      || !uuid.test(asset.objectPath.split("/")[0]) || !asset.objectPath.includes("/")
      || asset.objectPath.includes("..") || asset.objectPath.includes("//")) throw new Error("invalid_claim")
    return { id: asset.id, bucket: asset.bucket, objectPath: asset.objectPath, claimToken: asset.claimToken }
  })
}

/** One bounded durable batch. A crash/timeout leaves expiring claims for the next wakeup. */
export async function runMediaGc(deps: GcDependencies, signal = AbortSignal.timeout(20_000)) {
  const claimed = await deps.rpc("media_claim_gc", { p_limit: 4 }, signal)
  if (claimed.error) throw new Error("claim_failed")
  const assets = claims(claimed.data)
  const outcomes = await Promise.all(assets.map(async asset => {
    try {
      if (signal.aborted) return "deferred"
      let success = false
      try {
        const removed = await deps.remove(asset.bucket, asset.objectPath, signal)
        success = !removed.error
      } catch { /* A failed or uncertain removal retries idempotently. */ }
      if (signal.aborted) return "deferred"
      const completed = await deps.rpc("media_complete_gc", {
        p_asset_id: asset.id, p_claim_token: asset.claimToken, p_success: success,
      }, signal)
      if (completed.error || record(completed.data)?.ok !== true) return "deferred"
      return success ? "deleted" : "retry"
    } catch { return "deferred" }
  }))
  return {
    claimed: assets.length,
    deleted: outcomes.filter(value => value === "deleted").length,
    retry: outcomes.filter(value => value === "retry").length,
    deferred: outcomes.filter(value => value === "deferred").length,
  }
}

export async function mediaGcWorkerResponse(request: Request, secret: string | undefined, deps: () => GcDependencies): Promise<Response> {
  const headers = { "Cache-Control": "no-store" }
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } })
  if (!secret || secret.length < 32) return new Response(null, { status: 503, headers })
  const supplied = request.headers.get("authorization") ?? ""
  if (supplied.length > 1024) return new Response(null, { status: 401, headers })
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
  const [expected, received] = await Promise.all([digest(`Bearer ${secret}`), digest(supplied)])
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ received[index]
  if (difference !== 0) return new Response(null, { status: 401, headers })
  try {
    const counts = await runMediaGc(deps())
    return Response.json(counts, { headers, status: counts.retry || counts.deferred ? 503 : 200 })
  } catch {
    return Response.json({ error: "worker_unavailable" }, { status: 503, headers })
  }
}

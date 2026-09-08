import { createClient } from "npm:@supabase/supabase-js@2.103.0"
import { createMediaGcDependencies } from "../../../lib/media/server/gc-deps.ts"
import { mediaGcWorkerResponse } from "../../../lib/media/server/gc-worker.ts"

Deno.serve((request: Request) => mediaGcWorkerResponse(request, Deno.env.get("MEDIA_GC_WORKER_SECRET"), () => {
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: (input, init) => fetch(input, {
      ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
    }) },
  })
  return createMediaGcDependencies(client)
}))

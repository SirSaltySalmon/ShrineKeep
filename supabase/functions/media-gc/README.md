# Media cleanup worker

Requires the media lifecycle migrations through `20260908181000_restrict_direct_storage_writes.sql`. Deploy `media-gc` with JWT gateway verification disabled (`--no-verify-jwt`): the handler requires `MEDIA_GC_WORKER_SECRET`, at least 32 characters.

**Chosen trigger (W2):** Vercel cron GET `/api/media/gc` with `Authorization: Bearer CRON_SECRET`, implemented in `vercel.json` as `0 5 * * *`. That route calls the same `runMediaGc` core as this Edge function. This Vercel project is on Hobby, which rejects cron expressions that run more than once per day, so production GC is daily at 05:00 UTC. `/api/judge/sweep` shares the same `CRON_SECRET` mechanism.

The Edge function remains a valid wakeup target. After `pg_cron` and `pg_net` are available, `supabase/operations/schedule-media-gc.sql` can POST here instead of (or as well as) the Next route.

Local clone observation: `instrumentation.ts` GETs `/api/media/gc` every minute while `npm run dev` is running (no `VERCEL` env, `CRON_SECRET` ≥ 32 chars). That is the clone schedule; production remains `vercel.json`. Enqueue an asset, wait one minute, and confirm `media_gc_queue` is empty without posting the route by hand.

The function claims at most four assets, uses a 20-second invocation budget and 5-second network timeouts, and deletes through the Storage API. Output contains counts only.

Verification commands:

```text
npx vitest run lib/media/server/gc-worker.test.ts lib/media/server/upload-core.test.ts
npm run test:db:native
node --env-file=.env.local supabase/tests/media-gc-storage.mjs
node --env-file=.env.local supabase/tests/media-write-path.mjs
```

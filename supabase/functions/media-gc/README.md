# Media cleanup worker

Requires migration `20260907181159_media_gc_worker_leases.sql` and the preceding media migrations. Deploy `media-gc` with JWT gateway verification disabled (`--no-verify-jwt`): the handler requires its own `Authorization: Bearer ...` credential, `MEDIA_GC_WORKER_SECRET`, at least 32 characters. A public/anonymous Supabase key does not authorize this worker. Keep the dedicated credential in the deployment secret store; never use a browser environment variable.

The function claims at most four assets, uses a 20-second invocation budget and 5-second network timeouts, and deletes through the Storage API. Completion requires the current database claim token. Claims expire after two minutes. Storage failures retain `deleting` state and retry from 30 seconds up to one hour. Missing objects are a successful idempotent deletion. Interrupted completion leaves the claim recoverable. Output contains counts only; storage paths, signed URLs, credentials and raw errors are not logged.

After testing the deployed endpoint, provision `media_gc_url` and `media_gc_worker_secret` in Vault and run `supabase/operations/schedule-media-gc.sql`. It installs/updates one minute-by-minute `pg_cron` + `pg_net` wakeup. It requires the extensions to be available and a verified HTTPS function endpoint. See [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions). The scheduled database row, not a browser or Next.js request, supplies eventual processing. Scheduling is a deployment operation, not part of the additive migration.

Operational checks:

```sql
SELECT count(*) AS queued, min(enqueued_at) AS oldest,
       count(*) FILTER (WHERE attempt_count >= 5) AS repeatedly_failed,
       count(*) FILTER (WHERE claim_expires_at < now()) AS expired_claims
FROM public.media_gc_queue;
SELECT status, count(*) FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'shrinekeep-media-gc')
  AND start_time > now() - interval '1 hour' GROUP BY status;
```

Cron success proves dispatch only. Inspect `net._http_response` for recent response status and the function's count-only logs. Investigate repeated 503s, claims expired for more than five minutes, or a cleanup backlog older than one hour. Check Storage connectivity, function credentials and database availability. Do not clear the queue to fix an incident: it contains the cleanup manifest. Do not revert `deleting` to `ready`, reattach assets, or reuse immutable paths while deletion may still be running. Stop wakeups with `SELECT cron.unschedule('shrinekeep-media-gc')`; resume by rerunning the schedule script. After credential rotation, update both the function secret and Vault.

Verification commands:

```text
npx vitest run lib/media/server/gc-worker.test.ts
npm run test:db:native
node --env-file=.env.local supabase/tests/media-gc-storage.mjs
```

The Storage test refuses non-loopback hosts, creates its own user/object, injects a failed deletion, simulates a crash after actual object deletion, and verifies retry/tombstone before cleanup. SQL tests cover account-deletion manifest retention, reference/lease protection, fencing and client denial. Native tests add simultaneous-worker contention. The complete private-media cutover still requires owner upload preparation, raw Storage write restrictions and moderation purge integration.

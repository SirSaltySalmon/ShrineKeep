-- Clone/hosted optional wakeup for the Edge function.
-- Chosen production trigger is vercel.json GET /api/media/gc (W2).
-- Run this only after deploying media-gc and installing pg_cron + pg_net.
-- Provision media_gc_url and media_gc_worker_secret in Vault via the secret store.
BEGIN;
DO $$
DECLARE worker_url text; worker_secret text;
BEGIN
  SELECT decrypted_secret INTO STRICT worker_url FROM vault.decrypted_secrets WHERE name = 'media_gc_url';
  SELECT decrypted_secret INTO STRICT worker_secret FROM vault.decrypted_secrets WHERE name = 'media_gc_worker_secret';
  IF worker_url !~ '^https://[^/]+/functions/v1/media-gc$' OR char_length(worker_secret) < 32 THEN
    RAISE EXCEPTION 'GC endpoint or dedicated worker credential not configured';
  END IF;
END $$;
SELECT cron.schedule('shrinekeep-media-gc', '* * * * *', $job$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'media_gc_url'),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'media_gc_worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
$job$);
COMMIT;

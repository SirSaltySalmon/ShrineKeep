-- Durable GC: expiring fenced claims, bounded retry, account-safe cleanup manifests.
BEGIN;
ALTER TABLE public.media_gc_queue ADD COLUMN claim_token uuid;
ALTER TABLE public.media_gc_queue ADD COLUMN claim_expires_at timestamptz;

-- Keep immutable object identities after account deletion until Storage cleanup completes.
ALTER TABLE public.media_assets DROP CONSTRAINT media_assets_owner_id_fkey;

CREATE FUNCTION sharing_private.media_require_existing_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  -- Serialize registration with account deletion, while keeping old manifests.
  PERFORM 1 FROM public.users WHERE id = NEW.owner_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'media owner unavailable' USING ERRCODE = '23503'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER media_require_existing_owner BEFORE INSERT OR UPDATE OF owner_id ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION sharing_private.media_require_existing_owner();
REVOKE ALL ON FUNCTION sharing_private.media_require_existing_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sharing_private.media_require_existing_owner() TO service_role;

CREATE OR REPLACE FUNCTION public.media_claim_gc(p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  claimed jsonb := '[]'::jsonb;
  candidate record;
  asset public.media_assets%ROWTYPE;
  queued public.media_gc_queue%ROWTYPE;
  token uuid;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  -- One ordered pass recovers abandoned uploads, expired leases and pre-upgrade
  -- crashes. All locks follow account -> asset -> queue, including sweep inserts.
  -- Account ordering also agrees with two-account relationship/copy mutations.
  FOR candidate IN
    SELECT a.id AS asset_id, a.owner_id FROM public.media_assets a
    LEFT JOIN public.media_gc_queue q ON q.asset_id = a.id
    WHERE a.state <> 'deleted' AND (
      (q.asset_id IS NOT NULL AND q.next_attempt_at <= now()
        AND (q.claim_expires_at IS NULL OR q.claim_expires_at <= now()))
      OR (q.asset_id IS NULL AND (a.state = 'deleting' OR a.created_at < now() - interval '1 hour')
        AND NOT sharing_private.media_has_live_refs(a.id)))
    ORDER BY a.owner_id, a.id LIMIT p_limit
  LOOP
    PERFORM sharing_private.lock_accounts(candidate.owner_id);
    PERFORM sharing_private.media_lock_asset(candidate.asset_id);
    SELECT * INTO asset FROM public.media_assets WHERE id = candidate.asset_id FOR UPDATE;
    INSERT INTO public.media_gc_queue(asset_id) VALUES (candidate.asset_id) ON CONFLICT DO NOTHING;
    SELECT * INTO queued FROM public.media_gc_queue WHERE asset_id = candidate.asset_id FOR UPDATE SKIP LOCKED;
    IF NOT FOUND OR queued.next_attempt_at > now() OR queued.claim_expires_at > now() THEN CONTINUE; END IF;
    IF asset.state = 'deleted' OR sharing_private.media_has_live_refs(asset.id) THEN
      DELETE FROM public.media_gc_queue WHERE asset_id = candidate.asset_id;
      CONTINUE;
    END IF;
    token := gen_random_uuid();
    UPDATE public.media_assets SET state = 'deleting', updated_at = now() WHERE id = asset.id;
    UPDATE public.media_gc_queue SET claim_token = token,
      claim_expires_at = now() + interval '2 minutes', attempt_count = attempt_count + 1
      WHERE asset_id = asset.id;
    claimed := claimed || jsonb_build_array(jsonb_build_object(
      'id', asset.id, 'bucket', asset.bucket, 'objectPath', asset.object_path, 'claimToken', token));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assets', claimed));
END $$;

CREATE FUNCTION public.media_complete_gc(p_asset_id uuid, p_claim_token uuid, p_success boolean)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE; queued public.media_gc_queue%ROWTYPE;
BEGIN
  IF p_asset_id IS NULL OR p_claim_token IS NULL OR p_success IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id;
  IF FOUND THEN PERFORM sharing_private.lock_accounts(asset.owner_id); END IF;
  PERFORM sharing_private.media_lock_asset(p_asset_id);
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id FOR UPDATE;
  SELECT * INTO queued FROM public.media_gc_queue WHERE asset_id = p_asset_id FOR UPDATE;
  IF NOT FOUND OR queued.claim_token IS DISTINCT FROM p_claim_token
    OR queued.claim_expires_at <= now() OR asset.state <> 'deleting' THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'conflict', 'status', 409));
  END IF;
  IF p_success THEN
    IF sharing_private.media_has_live_refs(p_asset_id) THEN
      RAISE EXCEPTION 'deleting asset has live references' USING ERRCODE = '23514';
    END IF;
    UPDATE public.media_assets SET state = 'deleted', updated_at = now() WHERE id = p_asset_id;
    DELETE FROM public.media_gc_queue WHERE asset_id = p_asset_id;
  ELSE
    -- Stay deleting so no new attachment or signing races a retried removal.
    UPDATE public.media_gc_queue SET claim_token = NULL, claim_expires_at = NULL,
      next_attempt_at = now() + make_interval(secs => LEAST(3600, 15 * power(2, LEAST(attempt_count, 8))::integer)),
      last_error = 'storage_delete_failed' WHERE asset_id = p_asset_id;
  END IF;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'assetId', p_asset_id, 'state', CASE WHEN p_success THEN 'deleted' ELSE 'retry' END));
END $$;

-- The unfenced pre-worker finalizer cannot finish another worker's claim.
REVOKE ALL ON FUNCTION public.media_finalize_gc(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.media_complete_gc(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_complete_gc(uuid, uuid, boolean) TO service_role;
COMMIT;

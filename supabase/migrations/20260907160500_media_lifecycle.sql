-- T05 media registry, authorization, leases and queued GC. Service-only.
-- Does not change hosted bucket visibility or enable public media routes.
BEGIN;

CREATE TABLE public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bucket text NOT NULL CHECK (bucket IN ('item-photos', 'avatars')),
  object_path text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 4194304),
  state text NOT NULL CHECK (state IN ('pending', 'ready', 'deleting', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket, object_path),
  CHECK (
    char_length(object_path) BETWEEN 1 AND 512
    AND position('..' IN object_path) = 0
    AND position('//' IN object_path) = 0
    AND object_path LIKE owner_id::text || '/%'
  )
);

ALTER TABLE public.photos ADD COLUMN asset_id uuid REFERENCES public.media_assets(id);
ALTER TABLE public.public_profiles ADD COLUMN avatar_asset_id uuid REFERENCES public.media_assets(id);

CREATE TABLE public.copy_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_owner_id uuid NOT NULL,
  source_root_box_id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 128),
  payload_hash text NOT NULL CHECK (char_length(payload_hash) BETWEEN 1 AND 128),
  state text NOT NULL CHECK (state IN ('queued', 'planning', 'copying', 'finalizing', 'completed', 'failed', 'cancelled')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  lease_expires_at timestamptz,
  result_root_id uuid,
  failure_code text,
  source_revision bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requester_id, idempotency_key)
);

CREATE TABLE public.media_asset_leases (
  asset_id uuid NOT NULL REFERENCES public.media_assets(id) ON DELETE CASCADE,
  copy_job_id uuid NOT NULL REFERENCES public.copy_jobs(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (asset_id, copy_job_id)
);

CREATE TABLE public.media_gc_queue (
  asset_id uuid PRIMARY KEY REFERENCES public.media_assets(id) ON DELETE CASCADE,
  enqueued_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error text
);

CREATE INDEX media_assets_owner_state ON public.media_assets (owner_id, state, created_at);
CREATE INDEX media_photos_asset ON public.photos (asset_id) WHERE asset_id IS NOT NULL;
CREATE INDEX media_profile_avatar ON public.public_profiles (avatar_asset_id) WHERE avatar_asset_id IS NOT NULL;
CREATE INDEX media_leases_expiry ON public.media_asset_leases (expires_at);
CREATE INDEX media_gc_due ON public.media_gc_queue (next_attempt_at, asset_id);
CREATE INDEX copy_jobs_requester ON public.copy_jobs (requester_id, created_at DESC);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copy_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_asset_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_gc_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_assets, public.copy_jobs, public.media_asset_leases, public.media_gc_queue
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_assets, public.copy_jobs,
  public.media_asset_leases, public.media_gc_queue TO service_role;

CREATE FUNCTION sharing_private.owned_item_is_visible(p_item_id uuid, p_viewer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.items i
    JOIN public.boxes b ON b.id = i.box_id AND b.user_id = i.user_id
    WHERE i.id = p_item_id AND NOT i.is_wishlist
      AND sharing_private.collection_box_is_visible(b.id, p_viewer_id)
  );
$$;

CREATE FUNCTION sharing_private.media_lock_asset(p_asset_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('sharing-media:' || p_asset_id::text, 0));
END $$;

CREATE FUNCTION sharing_private.media_has_live_refs(p_asset_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.photos p WHERE p.asset_id = p_asset_id)
      OR EXISTS (SELECT 1 FROM public.public_profiles pr WHERE pr.avatar_asset_id = p_asset_id)
      OR EXISTS (SELECT 1 FROM public.media_asset_leases l WHERE l.asset_id = p_asset_id AND l.expires_at > now());
$$;

CREATE FUNCTION sharing_private.media_enqueue_if_unreferenced(p_asset_id uuid) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE owner_id uuid;
BEGIN
  IF p_asset_id IS NULL THEN RETURN; END IF;
  SELECT media_assets.owner_id INTO owner_id FROM public.media_assets WHERE id = p_asset_id;
  IF owner_id IS NOT NULL THEN PERFORM sharing_private.lock_accounts(owner_id); END IF;
  PERFORM sharing_private.media_lock_asset(p_asset_id);
  IF EXISTS (SELECT 1 FROM public.media_assets a WHERE a.id = p_asset_id AND a.state IN ('deleting', 'deleted')) THEN
    RETURN;
  END IF;
  IF sharing_private.media_has_live_refs(p_asset_id) THEN RETURN; END IF;
  INSERT INTO public.media_gc_queue (asset_id) VALUES (p_asset_id)
    ON CONFLICT (asset_id) DO UPDATE SET next_attempt_at = LEAST(public.media_gc_queue.next_attempt_at, now());
END $$;

CREATE FUNCTION sharing_private.media_queue_removed_assets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE queued uuid;
BEGIN
  IF TG_TABLE_NAME = 'photos' THEN
    FOR queued IN
      SELECT DISTINCT old_asset FROM (
        SELECT old_rows.asset_id AS old_asset FROM old_rows
      ) s WHERE old_asset IS NOT NULL
        AND old_asset NOT IN (SELECT coalesce(new_rows.asset_id, '00000000-0000-4000-8000-000000000000') FROM new_rows)
    LOOP
      PERFORM sharing_private.media_enqueue_if_unreferenced(queued);
    END LOOP;
  ELSE
    FOR queued IN
      SELECT DISTINCT old_asset FROM (
        SELECT old_rows.avatar_asset_id AS old_asset FROM old_rows
      ) s WHERE old_asset IS NOT NULL
        AND old_asset NOT IN (SELECT coalesce(new_rows.avatar_asset_id, '00000000-0000-4000-8000-000000000000') FROM new_rows)
    LOOP
      PERFORM sharing_private.media_enqueue_if_unreferenced(queued);
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION sharing_private.media_queue_deleted_photos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE queued uuid;
BEGIN
  FOR queued IN SELECT DISTINCT old_rows.asset_id FROM old_rows WHERE old_rows.asset_id IS NOT NULL LOOP
    PERFORM sharing_private.media_enqueue_if_unreferenced(queued);
  END LOOP;
  RETURN NULL;
END $$;

CREATE FUNCTION sharing_private.media_queue_deleted_avatars() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE queued uuid;
BEGIN
  FOR queued IN SELECT DISTINCT old_rows.avatar_asset_id FROM old_rows WHERE old_rows.avatar_asset_id IS NOT NULL LOOP
    PERFORM sharing_private.media_enqueue_if_unreferenced(queued);
  END LOOP;
  RETURN NULL;
END $$;

-- UPDATE of photos/profiles uses old+new tables. PostgreSQL cannot supply NEW TABLE on DELETE.
CREATE TRIGGER media_photos_queue_update AFTER UPDATE ON public.photos
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.media_queue_removed_assets();
CREATE TRIGGER media_photos_queue_delete AFTER DELETE ON public.photos
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.media_queue_deleted_photos();
CREATE TRIGGER media_profiles_queue_update AFTER UPDATE ON public.public_profiles
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.media_queue_removed_assets();
CREATE TRIGGER media_profiles_queue_delete AFTER DELETE ON public.public_profiles
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.media_queue_deleted_avatars();

CREATE FUNCTION sharing_private.guard_photo_asset() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE; owner_id uuid;
BEGIN
  IF NEW.asset_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO owner_id FROM public.items WHERE id = NEW.item_id;
  IF owner_id IS NULL THEN RAISE EXCEPTION 'invalid photo item' USING ERRCODE = '23514'; END IF;
  PERFORM sharing_private.media_lock_asset(NEW.asset_id);
  SELECT * INTO asset FROM public.media_assets WHERE id = NEW.asset_id FOR UPDATE;
  IF NOT FOUND OR asset.state <> 'ready' OR asset.owner_id IS DISTINCT FROM owner_id OR asset.bucket <> 'item-photos'
     OR (NEW.storage_path IS DISTINCT FROM asset.object_path) THEN
    RAISE EXCEPTION 'invalid media reference' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER media_photos_guard_asset BEFORE INSERT OR UPDATE OF asset_id, storage_path, item_id ON public.photos
  FOR EACH ROW EXECUTE FUNCTION sharing_private.guard_photo_asset();

CREATE FUNCTION sharing_private.guard_avatar_asset() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE;
BEGIN
  IF NEW.avatar_asset_id IS NULL THEN RETURN NEW; END IF;
  PERFORM sharing_private.media_lock_asset(NEW.avatar_asset_id);
  SELECT * INTO asset FROM public.media_assets WHERE id = NEW.avatar_asset_id FOR UPDATE;
  IF NOT FOUND OR asset.state <> 'ready' OR asset.owner_id IS DISTINCT FROM NEW.user_id OR asset.bucket <> 'avatars' THEN
    RAISE EXCEPTION 'invalid media reference' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER media_profiles_guard_avatar BEFORE INSERT OR UPDATE OF avatar_asset_id ON public.public_profiles
  FOR EACH ROW EXECUTE FUNCTION sharing_private.guard_avatar_asset();

CREATE FUNCTION sharing_private.parse_legacy_storage_path(p_owner_id uuid, p_storage_path text, p_url text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE path text := nullif(btrim(coalesce(p_storage_path, '')), '');
DECLARE marker text;
BEGIN
  IF path IS NOT NULL AND path LIKE p_owner_id::text || '/%' AND position('..' IN path) = 0 THEN
    RETURN path;
  END IF;
  IF p_url IS NULL THEN RETURN NULL; END IF;
  marker := '/storage/v1/object/public/item-photos/';
  IF strpos(p_url, marker) > 0 THEN
    path := substr(p_url, strpos(p_url, marker) + char_length(marker));
  ELSE
    marker := '/storage/v1/object/authenticated/item-photos/';
    IF strpos(p_url, marker) > 0 THEN
      path := substr(p_url, strpos(p_url, marker) + char_length(marker));
    END IF;
  END IF;
  IF path IS NOT NULL THEN
    path := split_part(path, '?', 1);
    IF path LIKE p_owner_id::text || '/%' AND position('..' IN path) = 0 AND position('//' IN path) = 0 THEN
      RETURN path;
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION public.media_register_legacy_photo(p_photo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE photo public.photos%ROWTYPE; owner_id uuid; stored_path text; asset public.media_assets%ROWTYPE;
BEGIN
  IF p_photo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT * INTO photo FROM public.photos WHERE id = p_photo_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  SELECT user_id INTO owner_id FROM public.items WHERE id = photo.item_id;
  PERFORM sharing_private.lock_accounts(owner_id);
  IF photo.asset_id IS NOT NULL THEN
    SELECT * INTO asset FROM public.media_assets WHERE id = photo.asset_id;
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', asset.id, 'state', asset.state));
  END IF;
  stored_path := sharing_private.parse_legacy_storage_path(owner_id, photo.storage_path, photo.url);
  IF stored_path IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT * INTO asset FROM public.media_assets WHERE bucket = 'item-photos' AND media_assets.object_path = stored_path FOR UPDATE;
  IF FOUND THEN
    IF asset.owner_id IS DISTINCT FROM owner_id OR asset.state IN ('deleting', 'deleted') THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
    END IF;
  ELSE
    INSERT INTO public.media_assets (owner_id, bucket, object_path, mime, byte_size, state)
      VALUES (owner_id, 'item-photos', stored_path, 'image/jpeg', 1, 'ready')
      RETURNING * INTO asset;
  END IF;
  UPDATE public.photos SET storage_path = stored_path, asset_id = asset.id WHERE id = photo.id;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', asset.id, 'state', asset.state));
END $$;

CREATE FUNCTION public.media_register_asset(
  p_owner_id uuid, p_bucket text, p_object_path text, p_mime text, p_byte_size bigint, p_state text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL OR p_bucket IS NULL OR p_object_path IS NULL OR p_mime IS NULL OR p_byte_size IS NULL
     OR p_state IS NULL OR p_state NOT IN ('pending', 'ready') THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  PERFORM sharing_private.lock_accounts(p_owner_id);
  BEGIN
    INSERT INTO public.media_assets (owner_id, bucket, object_path, mime, byte_size, state)
      VALUES (p_owner_id, p_bucket, p_object_path, p_mime, p_byte_size, p_state)
      RETURNING * INTO asset;
  EXCEPTION WHEN check_violation OR unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', asset.id, 'state', asset.state, 'bucket', asset.bucket, 'objectPath', asset.object_path));
END $$;

CREATE FUNCTION public.media_finalize_upload(p_asset_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE;
BEGIN
  IF p_asset_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  PERFORM sharing_private.lock_accounts(asset.owner_id);
  PERFORM sharing_private.media_lock_asset(p_asset_id);
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id FOR UPDATE;
  IF asset.state = 'ready' THEN
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', asset.id, 'state', asset.state));
  END IF;
  IF asset.state <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  UPDATE public.media_assets SET state = 'ready', updated_at = now() WHERE id = asset.id;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', asset.id, 'state', 'ready'));
END $$;

CREATE FUNCTION public.media_attach_photo(p_photo_id uuid, p_asset_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE photo public.photos%ROWTYPE; asset public.media_assets%ROWTYPE; owner_id uuid;
BEGIN
  IF p_photo_id IS NULL OR p_asset_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT * INTO photo FROM public.photos WHERE id = p_photo_id;
  SELECT user_id INTO owner_id FROM public.items WHERE id = photo.item_id;
  IF photo.id IS NULL OR owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  PERFORM sharing_private.lock_accounts(owner_id);
  PERFORM sharing_private.media_lock_asset(p_asset_id);
  SELECT * INTO photo FROM public.photos WHERE id = p_photo_id FOR UPDATE;
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND OR asset.state <> 'ready' OR asset.owner_id IS DISTINCT FROM owner_id OR asset.bucket <> 'item-photos' THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  UPDATE public.photos SET asset_id = asset.id, storage_path = asset.object_path WHERE id = photo.id;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('referenceId', photo.id, 'assetId', asset.id));
END $$;

CREATE FUNCTION public.media_attach_avatar(p_owner_id uuid, p_asset_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL OR p_asset_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  PERFORM sharing_private.lock_accounts(p_owner_id);
  PERFORM sharing_private.media_lock_asset(p_asset_id);
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND OR asset.state <> 'ready' OR asset.owner_id IS DISTINCT FROM p_owner_id OR asset.bucket <> 'avatars' THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  INSERT INTO public.public_profiles (user_id, avatar_asset_id) VALUES (p_owner_id, p_asset_id)
    ON CONFLICT (user_id) DO UPDATE SET avatar_asset_id = excluded.avatar_asset_id, updated_at = now();
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('referenceId', p_owner_id, 'assetId', p_asset_id));
END $$;

CREATE FUNCTION public.media_lease_asset(p_job_id uuid, p_asset_id uuid, p_ttl_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE; job public.copy_jobs%ROWTYPE;
BEGIN
  IF p_job_id IS NULL OR p_asset_id IS NULL OR p_ttl_seconds IS NULL OR p_ttl_seconds < 1 OR p_ttl_seconds > 3600 THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  PERFORM sharing_private.lock_accounts(asset.owner_id);
  PERFORM sharing_private.media_lock_asset(p_asset_id);
  SELECT * INTO job FROM public.copy_jobs WHERE id = p_job_id FOR UPDATE;
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id FOR UPDATE;
  IF job.id IS NULL OR asset.id IS NULL OR asset.state <> 'ready' OR job.state NOT IN ('queued', 'planning', 'copying', 'finalizing') THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  INSERT INTO public.media_asset_leases (asset_id, copy_job_id, expires_at)
    VALUES (p_asset_id, p_job_id, now() + make_interval(secs => p_ttl_seconds))
    ON CONFLICT (asset_id, copy_job_id) DO UPDATE SET expires_at = excluded.expires_at;
  DELETE FROM public.media_gc_queue WHERE asset_id = p_asset_id;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', p_asset_id, 'copyJobId', p_job_id));
END $$;

CREATE FUNCTION public.media_release_lease(p_job_id uuid, p_asset_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE owner_id uuid;
BEGIN
  IF p_job_id IS NULL OR p_asset_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT media_assets.owner_id INTO owner_id FROM public.media_assets WHERE id = p_asset_id;
  IF owner_id IS NOT NULL THEN PERFORM sharing_private.lock_accounts(owner_id); END IF;
  PERFORM sharing_private.media_lock_asset(p_asset_id);
  DELETE FROM public.media_asset_leases WHERE asset_id = p_asset_id AND copy_job_id = p_job_id;
  PERFORM sharing_private.media_enqueue_if_unreferenced(p_asset_id);
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', p_asset_id));
END $$;

CREATE FUNCTION public.media_authorize_reference(p_kind text, p_reference_id uuid, p_viewer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  photo public.photos%ROWTYPE;
  item public.items%ROWTYPE;
  asset public.media_assets%ROWTYPE;
  owner_id uuid;
  stored_path text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('photo', 'avatar') OR p_reference_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  IF p_kind = 'avatar' THEN
    IF NOT sharing_private.owner_is_publishable(p_reference_id) OR sharing_private.pair_is_blocked(p_viewer_id, p_reference_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
    END IF;
    SELECT * INTO asset FROM public.media_assets a
      JOIN public.public_profiles pr ON pr.avatar_asset_id = a.id
      WHERE pr.user_id = p_reference_id;
    IF NOT FOUND OR asset.state <> 'ready' THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
    END IF;
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'kind', 'uploaded', 'referenceId', p_reference_id, 'bucket', asset.bucket, 'objectPath', asset.object_path,
      'mime', asset.mime, 'externalUrl', NULL));
  END IF;

  SELECT * INTO photo FROM public.photos WHERE id = p_reference_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  SELECT * INTO item FROM public.items WHERE id = photo.item_id;
  owner_id := item.user_id;
  IF item.is_wishlist THEN
    IF NOT sharing_private.wishlist_item_is_visible(item.id, p_viewer_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
    END IF;
  ELSE
    IF NOT sharing_private.owned_item_is_visible(item.id, p_viewer_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
    END IF;
  END IF;

  IF photo.asset_id IS NOT NULL THEN
    SELECT * INTO asset FROM public.media_assets WHERE id = photo.asset_id;
    IF NOT FOUND OR asset.state <> 'ready' THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
    END IF;
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'kind', 'uploaded', 'referenceId', photo.id, 'bucket', asset.bucket, 'objectPath', asset.object_path,
      'mime', asset.mime, 'externalUrl', NULL));
  END IF;

  stored_path := sharing_private.parse_legacy_storage_path(owner_id, photo.storage_path, photo.url);
  IF stored_path IS NOT NULL THEN
    -- Unregistered uploads are not signed until T05 registration/backfill attaches an asset.
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  IF photo.url ~* '^https://' AND photo.url !~* 'javascript:' THEN
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'kind', 'external', 'referenceId', photo.id, 'bucket', NULL, 'objectPath', NULL,
      'mime', NULL, 'externalUrl', photo.url));
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
END $$;

CREATE FUNCTION public.media_claim_gc(p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  claimed jsonb := '[]'::jsonb;
  queue_asset uuid;
  asset public.media_assets%ROWTYPE;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  INSERT INTO public.media_gc_queue (asset_id)
    SELECT a.id FROM public.media_assets a
    WHERE a.state = 'pending' AND a.created_at < now() - interval '1 hour'
      AND NOT sharing_private.media_has_live_refs(a.id)
    ON CONFLICT DO NOTHING;
  FOR queue_asset IN
    SELECT q.asset_id FROM public.media_gc_queue q
    WHERE q.next_attempt_at <= now()
    ORDER BY q.next_attempt_at, q.asset_id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    SELECT * INTO asset FROM public.media_assets WHERE id = queue_asset;
    IF NOT FOUND THEN
      DELETE FROM public.media_gc_queue WHERE asset_id = queue_asset;
      CONTINUE;
    END IF;
    PERFORM sharing_private.lock_accounts(asset.owner_id);
    PERFORM sharing_private.media_lock_asset(queue_asset);
    SELECT * INTO asset FROM public.media_assets WHERE id = queue_asset FOR UPDATE;
    IF NOT FOUND OR sharing_private.media_has_live_refs(queue_asset) OR asset.state NOT IN ('pending', 'ready') THEN
      DELETE FROM public.media_gc_queue WHERE asset_id = queue_asset;
      CONTINUE;
    END IF;
    UPDATE public.media_assets SET state = 'deleting', updated_at = now() WHERE id = queue_asset;
    claimed := claimed || jsonb_build_array(jsonb_build_object(
      'id', asset.id, 'bucket', asset.bucket, 'objectPath', asset.object_path));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assets', claimed));
END $$;

CREATE FUNCTION public.media_finalize_gc(p_asset_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE;
BEGIN
  IF p_asset_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  PERFORM sharing_private.lock_accounts(asset.owner_id);
  PERFORM sharing_private.media_lock_asset(p_asset_id);
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND OR asset.state <> 'deleting' THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  IF sharing_private.media_has_live_refs(p_asset_id) THEN
    UPDATE public.media_assets SET state = 'ready', updated_at = now() WHERE id = p_asset_id;
    DELETE FROM public.media_gc_queue WHERE asset_id = p_asset_id;
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  UPDATE public.media_assets SET state = 'deleted', updated_at = now() WHERE id = p_asset_id;
  DELETE FROM public.media_gc_queue WHERE asset_id = p_asset_id;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', p_asset_id, 'state', 'deleted'));
END $$;

REVOKE ALL ON FUNCTION sharing_private.owned_item_is_visible(uuid, uuid),
  sharing_private.media_lock_asset(uuid),
  sharing_private.media_has_live_refs(uuid),
  sharing_private.media_enqueue_if_unreferenced(uuid),
  sharing_private.parse_legacy_storage_path(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sharing_private.owned_item_is_visible(uuid, uuid),
  sharing_private.media_lock_asset(uuid),
  sharing_private.media_has_live_refs(uuid),
  sharing_private.media_enqueue_if_unreferenced(uuid),
  sharing_private.parse_legacy_storage_path(uuid, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION sharing_private.media_queue_removed_assets(),
  sharing_private.media_queue_deleted_photos(),
  sharing_private.media_queue_deleted_avatars(),
  sharing_private.guard_photo_asset(),
  sharing_private.guard_avatar_asset()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.media_register_legacy_photo(uuid),
  public.media_register_asset(uuid, text, text, text, bigint, text),
  public.media_finalize_upload(uuid),
  public.media_attach_photo(uuid, uuid),
  public.media_attach_avatar(uuid, uuid),
  public.media_lease_asset(uuid, uuid, integer),
  public.media_release_lease(uuid, uuid),
  public.media_authorize_reference(text, uuid, uuid),
  public.media_claim_gc(integer),
  public.media_finalize_gc(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_register_legacy_photo(uuid),
  public.media_register_asset(uuid, text, text, text, bigint, text),
  public.media_finalize_upload(uuid),
  public.media_attach_photo(uuid, uuid),
  public.media_attach_avatar(uuid, uuid),
  public.media_lease_asset(uuid, uuid, integer),
  public.media_release_lease(uuid, uuid),
  public.media_authorize_reference(text, uuid, uuid),
  public.media_claim_gc(integer),
  public.media_finalize_gc(uuid)
  TO service_role;
COMMIT;

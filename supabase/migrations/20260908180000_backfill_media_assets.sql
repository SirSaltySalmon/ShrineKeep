-- W2: restartable legacy registration, discard, and owner purge onto the GC queue.
BEGIN;

CREATE OR REPLACE FUNCTION sharing_private.parse_legacy_storage_path(p_owner_id uuid, p_storage_path text, p_url text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE path text := nullif(btrim(coalesce(p_storage_path, '')), '');
DECLARE marker text;
DECLARE markers text[] := ARRAY[
  '/storage/v1/object/public/item-photos/',
  '/storage/v1/object/authenticated/item-photos/',
  '/storage/v1/object/public/avatars/',
  '/storage/v1/object/authenticated/avatars/'
];
BEGIN
  IF path IS NOT NULL AND path LIKE p_owner_id::text || '/%' AND position('..' IN path) = 0 THEN
    RETURN path;
  END IF;
  IF p_url IS NULL THEN RETURN NULL; END IF;
  FOREACH marker IN ARRAY markers LOOP
    IF strpos(p_url, marker) > 0 THEN
      path := split_part(substr(p_url, strpos(p_url, marker) + char_length(marker)), '?', 1);
      IF path LIKE p_owner_id::text || '/%' AND position('..' IN path) = 0 AND position('//' IN path) = 0 THEN
        RETURN path;
      END IF;
    END IF;
  END LOOP;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.media_register_legacy_avatar(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  stored_path text;
  asset public.media_assets%ROWTYPE;
  avatar_url text;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'authentication_required', 'status', 401));
  END IF;
  PERFORM sharing_private.lock_accounts(p_owner_id);
  IF EXISTS (SELECT 1 FROM public.public_profiles pr WHERE pr.user_id = p_owner_id AND pr.avatar_asset_id IS NOT NULL) THEN
    SELECT a.* INTO asset FROM public.media_assets a
      JOIN public.public_profiles pr ON pr.avatar_asset_id = a.id
      WHERE pr.user_id = p_owner_id;
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', asset.id, 'state', asset.state));
  END IF;
  SELECT users.avatar_url INTO avatar_url FROM public.users WHERE id = p_owner_id;
  stored_path := sharing_private.parse_legacy_storage_path(p_owner_id, NULL, avatar_url);
  IF stored_path IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT * INTO asset FROM public.media_assets WHERE bucket = 'avatars' AND media_assets.object_path = stored_path FOR UPDATE;
  IF FOUND THEN
    IF asset.owner_id IS DISTINCT FROM p_owner_id OR asset.state IN ('deleting', 'deleted') THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
    END IF;
  ELSE
    INSERT INTO public.media_assets (owner_id, bucket, object_path, mime, byte_size, state)
      VALUES (p_owner_id, 'avatars', stored_path, 'image/jpeg', 1, 'ready')
      RETURNING * INTO asset;
  END IF;
  INSERT INTO public.public_profiles (user_id, avatar_asset_id) VALUES (p_owner_id, asset.id)
    ON CONFLICT (user_id) DO UPDATE SET avatar_asset_id = EXCLUDED.avatar_asset_id
      WHERE public.public_profiles.avatar_asset_id IS NULL;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', asset.id, 'state', asset.state));
END $$;

CREATE FUNCTION public.media_get_owned_asset(p_owner_id uuid, p_asset_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'authentication_required', 'status', 401));
  END IF;
  IF p_asset_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id AND owner_id = p_owner_id;
  IF NOT FOUND OR asset.state IN ('deleting', 'deleted') THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'assetId', asset.id, 'bucket', asset.bucket, 'objectPath', asset.object_path, 'state', asset.state));
END $$;

CREATE FUNCTION public.media_discard_upload(p_owner_id uuid, p_asset_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE asset public.media_assets%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'authentication_required', 'status', 401));
  END IF;
  IF p_asset_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  PERFORM sharing_private.lock_accounts(p_owner_id);
  PERFORM sharing_private.media_lock_asset(p_asset_id);
  SELECT * INTO asset FROM public.media_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND OR asset.owner_id IS DISTINCT FROM p_owner_id THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  IF sharing_private.media_has_live_refs(p_asset_id) THEN
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', p_asset_id, 'discarded', false));
  END IF;
  PERFORM sharing_private.media_enqueue_if_unreferenced(p_asset_id);
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('assetId', p_asset_id, 'discarded', true));
END $$;

CREATE FUNCTION public.media_queue_owner_purge(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE photos_queued integer := 0;
DECLARE avatars_queued integer := 0;
BEGIN
  IF p_owner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  PERFORM sharing_private.lock_accounts(p_owner_id);
  UPDATE public.photos p
     SET asset_id = NULL, storage_path = NULL
    FROM public.items i
   WHERE i.id = p.item_id AND i.user_id = p_owner_id AND p.asset_id IS NOT NULL;
  UPDATE public.public_profiles
     SET avatar_asset_id = NULL, updated_at = now()
   WHERE user_id = p_owner_id AND avatar_asset_id IS NOT NULL;
  INSERT INTO public.media_gc_queue (asset_id)
    SELECT a.id FROM public.media_assets a
     WHERE a.owner_id = p_owner_id AND a.state <> 'deleted'
    ON CONFLICT (asset_id) DO UPDATE SET next_attempt_at = LEAST(public.media_gc_queue.next_attempt_at, now());
  SELECT count(*)::integer INTO photos_queued
    FROM public.media_gc_queue q
    JOIN public.media_assets a ON a.id = q.asset_id
   WHERE a.owner_id = p_owner_id AND a.bucket = 'item-photos';
  SELECT count(*)::integer INTO avatars_queued
    FROM public.media_gc_queue q
    JOIN public.media_assets a ON a.id = q.asset_id
   WHERE a.owner_id = p_owner_id AND a.bucket = 'avatars';
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'itemPhotosQueued', photos_queued, 'avatarsQueued', avatars_queued));
END $$;

CREATE FUNCTION public.media_backfill_legacy_assets(p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  processed integer := 0;
  registered integer := 0;
  avatar_processed integer := 0;
  avatar_registered integer := 0;
  failures jsonb := '[]'::jsonb;
  photo_id uuid;
  owner_id uuid;
  response jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  FOR photo_id IN
    SELECT p.id FROM public.photos p
    WHERE p.asset_id IS NULL
      AND (
        nullif(btrim(coalesce(p.storage_path, '')), '') IS NOT NULL
        OR p.url LIKE '%/storage/v1/object/%'
      )
    ORDER BY p.id
    LIMIT p_limit
  LOOP
    processed := processed + 1;
    response := public.media_register_legacy_photo(photo_id);
    IF coalesce((response->>'ok')::boolean, false) THEN
      registered := registered + 1;
    ELSE
      failures := failures || jsonb_build_array(jsonb_build_object(
        'kind', 'photo',
        'id', photo_id,
        'code', coalesce(response->'error'->>'code', 'invalid_input')));
    END IF;
  END LOOP;
  FOR owner_id IN
    SELECT u.id FROM public.users u
    LEFT JOIN public.public_profiles pr ON pr.user_id = u.id
    WHERE (pr.avatar_asset_id IS NULL)
      AND u.avatar_url IS NOT NULL
      AND u.avatar_url LIKE '%/storage/v1/object/%/avatars/%'
    ORDER BY u.id
    LIMIT p_limit
  LOOP
    avatar_processed := avatar_processed + 1;
    response := public.media_register_legacy_avatar(owner_id);
    IF coalesce((response->>'ok')::boolean, false) THEN
      avatar_registered := avatar_registered + 1;
    ELSE
      failures := failures || jsonb_build_array(jsonb_build_object(
        'kind', 'avatar',
        'id', owner_id,
        'code', coalesce(response->'error'->>'code', 'invalid_input')));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'photosProcessed', processed,
    'photosRegistered', registered,
    'avatarsProcessed', avatar_processed,
    'avatarsRegistered', avatar_registered,
    'failures', failures));
END $$;

REVOKE ALL ON FUNCTION public.media_register_legacy_avatar(uuid),
  public.media_get_owned_asset(uuid, uuid),
  public.media_discard_upload(uuid, uuid),
  public.media_queue_owner_purge(uuid),
  public.media_backfill_legacy_assets(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_register_legacy_avatar(uuid),
  public.media_get_owned_asset(uuid, uuid),
  public.media_discard_upload(uuid, uuid),
  public.media_queue_owner_purge(uuid),
  public.media_backfill_legacy_assets(integer)
  TO service_role;
COMMIT;

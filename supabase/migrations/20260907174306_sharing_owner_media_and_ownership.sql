-- T01 same-owner reference constraints (clone/native data is clean) plus
-- T05 owner-only media authorization. Public predicates stay unchanged.
BEGIN;

ALTER TABLE public.boxes
  ADD CONSTRAINT boxes_user_id_id_key UNIQUE (user_id, id);

ALTER TABLE public.boxes
  ADD CONSTRAINT boxes_parent_same_owner
  FOREIGN KEY (user_id, parent_box_id) REFERENCES public.boxes (user_id, id);

ALTER TABLE public.items
  ADD CONSTRAINT items_box_same_owner
  FOREIGN KEY (user_id, box_id) REFERENCES public.boxes (user_id, id);

ALTER TABLE public.items
  ADD CONSTRAINT items_wishlist_target_same_owner
  FOREIGN KEY (user_id, wishlist_target_box_id) REFERENCES public.boxes (user_id, id);

CREATE OR REPLACE FUNCTION sharing_private.parse_legacy_storage_path(p_owner_id uuid, p_storage_path text, p_url text)
RETURNS text LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE path text := nullif(btrim(coalesce(p_storage_path, '')), '');
DECLARE marker text;
DECLARE markers text[] := ARRAY[
  '/storage/v1/object/public/item-photos/',
  '/storage/v1/object/authenticated/item-photos/',
  '/storage/v1/object/sign/item-photos/',
  '/storage/v1/object/public/avatars/',
  '/storage/v1/object/authenticated/avatars/',
  '/storage/v1/object/sign/avatars/'
];
BEGIN
  IF path IS NOT NULL AND path LIKE p_owner_id::text || '/%' AND position('..' IN path) = 0 THEN
    RETURN path;
  END IF;
  IF p_url IS NULL THEN RETURN NULL; END IF;
  FOREACH marker IN ARRAY markers LOOP
    IF strpos(p_url, marker) > 0 THEN
      path := substr(p_url, strpos(p_url, marker) + char_length(marker));
      EXIT;
    END IF;
  END LOOP;
  IF path IS NOT NULL THEN
    path := split_part(path, '?', 1);
    IF path LIKE p_owner_id::text || '/%' AND position('..' IN path) = 0 AND position('//' IN path) = 0 THEN
      RETURN path;
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION public.media_authorize_owner_reference(p_kind text, p_reference_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  photo public.photos%ROWTYPE;
  item public.items%ROWTYPE;
  asset public.media_assets%ROWTYPE;
  stored_path text;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'authentication_required', 'status', 401));
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('photo', 'avatar') OR p_reference_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;

  IF p_kind = 'avatar' THEN
    IF p_reference_id IS DISTINCT FROM p_actor_id THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
    END IF;
    SELECT a.* INTO asset FROM public.media_assets a
      JOIN public.public_profiles pr ON pr.avatar_asset_id = a.id
      WHERE pr.user_id = p_actor_id;
    IF NOT FOUND OR asset.state <> 'ready' THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
    END IF;
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'kind', 'uploaded', 'referenceId', p_actor_id, 'bucket', asset.bucket, 'objectPath', asset.object_path,
      'mime', asset.mime, 'externalUrl', NULL));
  END IF;

  SELECT * INTO photo FROM public.photos WHERE id = p_reference_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  SELECT * INTO item FROM public.items WHERE id = photo.item_id;
  IF item.user_id IS DISTINCT FROM p_actor_id THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
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

  stored_path := sharing_private.parse_legacy_storage_path(item.user_id, photo.storage_path, photo.url);
  IF stored_path IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  IF photo.url ~* '^https://' AND photo.url !~* 'javascript:' THEN
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'kind', 'external', 'referenceId', photo.id, 'bucket', NULL, 'objectPath', NULL,
      'mime', NULL, 'externalUrl', photo.url));
  END IF;
  RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
END $$;

CREATE FUNCTION public.media_register_legacy_photo_for_owner(p_actor_id uuid, p_photo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE owner_id uuid;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'authentication_required', 'status', 401));
  END IF;
  IF p_photo_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  SELECT i.user_id INTO owner_id
    FROM public.photos p JOIN public.items i ON i.id = p.item_id
    WHERE p.id = p_photo_id;
  IF owner_id IS NULL OR owner_id IS DISTINCT FROM p_actor_id THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  RETURN public.media_register_legacy_photo(p_photo_id);
END $$;

CREATE FUNCTION public.media_register_legacy_avatar(p_owner_id uuid)
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

REVOKE ALL ON FUNCTION public.media_authorize_owner_reference(text, uuid, uuid),
  public.media_register_legacy_photo_for_owner(uuid, uuid),
  public.media_register_legacy_avatar(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_authorize_owner_reference(text, uuid, uuid),
  public.media_register_legacy_photo_for_owner(uuid, uuid),
  public.media_register_legacy_avatar(uuid) TO service_role;
COMMIT;

-- Unify public identity with account display name (users.name).
-- Drop public_profiles.nickname and user_settings.use_custom_display_name.
-- Empty signup names become Collector-<uuid suffix>; OAuth/signup names are public.
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, username, email, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
    NEW.email,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      'Collector-' || right(NEW.id::text, 8)
    )
  );
  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

UPDATE public.users AS u
SET name = COALESCE(
  NULLIF(btrim(u.name), ''),
  (
    SELECT NULLIF(btrim(p.nickname), '')
    FROM public.public_profiles AS p
    WHERE p.user_id = u.id
  ),
  'Collector-' || right(u.id::text, 8)
);

CREATE OR REPLACE FUNCTION sharing_private.public_identity(p_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p_user_id,
    'nickname', coalesce(nullif(btrim(u.name), ''), 'Collector-' || right(p_user_id::text, 8)),
    'avatar', NULL)
  FROM (SELECT name FROM public.users WHERE id = p_user_id) u
  UNION ALL
  SELECT jsonb_build_object(
    'id', p_user_id,
    'nickname', 'Collector-' || right(p_user_id::text, 8),
    'avatar', NULL)
  WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION sharing_private.display_nickname(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(nullif(btrim(u.name), ''), 'Collector-' || right(p_user_id::text, 8))
  FROM (SELECT name FROM public.users WHERE id = p_user_id) u
  UNION ALL
  SELECT 'Collector-' || right(p_user_id::text, 8)
  WHERE NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id)
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.sharing_read_context(p_owner_id uuid, p_viewer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  category text;
  relation text := 'none';
  pair public.social_friendships%ROWTYPE;
  revision bigint;
  profile public.public_profiles%ROWTYPE;
  settings public.user_settings%ROWTYPE;
  owner_name text;
  style jsonb;
  avatar_ref uuid;
BEGIN
  IF NOT sharing_private.owner_is_publishable(p_owner_id) OR sharing_private.pair_is_blocked(p_viewer_id, p_owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  SELECT sharing_revision, name INTO revision, owner_name FROM public.users WHERE id = p_owner_id;
  SELECT * INTO profile FROM public.public_profiles WHERE user_id = p_owner_id;
  SELECT * INTO settings FROM public.user_settings WHERE user_id = p_owner_id;
  IF p_viewer_id IS NULL THEN category := 'guest';
  ELSIF p_viewer_id = p_owner_id THEN category := 'owner'; relation := 'self';
  ELSE
    SELECT * INTO pair FROM public.social_friendships
      WHERE user_low = least(p_owner_id, p_viewer_id) AND user_high = greatest(p_owner_id, p_viewer_id);
    IF pair.status = 'accepted' THEN category := 'friend'; relation := 'friends';
    ELSE
      category := 'stranger';
      IF pair.status = 'pending' THEN
        relation := CASE WHEN pair.requested_by = p_viewer_id THEN 'outgoing_pending' ELSE 'incoming_pending' END;
      END IF;
    END IF;
  END IF;
  IF settings.profile_share_style THEN
    style := jsonb_build_object(
      'colorScheme', coalesce(settings.color_scheme, '{}'::jsonb),
      'headerFontFamily', settings.header_font_family,
      'bodyFontFamily', settings.body_font_family,
      'borderRadius', settings.border_radius);
  ELSE
    style := NULL;
  END IF;
  SELECT p_owner_id INTO avatar_ref FROM public.media_assets a
    WHERE a.id = profile.avatar_asset_id AND a.state = 'ready' AND a.bucket = 'avatars';
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'revision', revision::text, 'viewerCategory', category,
    'profile', jsonb_build_object('id', p_owner_id,
      'nickname', coalesce(nullif(btrim(owner_name), ''), 'Collector-' || right(p_owner_id::text, 8)),
      'bio', coalesce(profile.bio, ''), 'avatar', NULL, 'avatarReferenceId', avatar_ref,
      'sharedStyle', style, 'relationship', relation)));
END $$;

CREATE OR REPLACE FUNCTION public.sharing_read_owner_settings(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE settings public.user_settings%ROWTYPE; profile public.public_profiles%ROWTYPE; revision bigint;
  owner_name text; visible_count bigint; total_count bigint;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'authentication_required', 'status', 401));
  END IF;
  PERFORM sharing_private.lock_accounts(p_actor_id);
  SELECT * INTO settings FROM public.user_settings WHERE user_id = p_actor_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  SELECT * INTO profile FROM public.public_profiles WHERE user_id = p_actor_id;
  SELECT sharing_revision, name INTO revision, owner_name FROM public.users WHERE id = p_actor_id;
  SELECT count(*) INTO total_count FROM public.items WHERE user_id = p_actor_id AND is_wishlist;
  SELECT count(*) INTO visible_count FROM public.items i
    WHERE i.user_id = p_actor_id AND sharing_private.wishlist_item_is_visible(i.id, NULL);
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'revision', revision::text,
    'nickname', nullif(btrim(coalesce(owner_name, '')), ''),
    'bio', coalesce(profile.bio, ''),
    'profileShareStyle', settings.profile_share_style,
    'wishlistLinkEnabled', settings.wishlist_link_enabled,
    'wishlistShareToken', settings.wishlist_share_token,
    'root', jsonb_build_object(
      'collectionVisibility', settings.root_collection_visibility,
      'shareFinancials', settings.root_share_financials,
      'wishlistVisibility', settings.root_wishlist_visibility),
    'wishlistGuestVisibleCount', coalesce(visible_count, 0),
    'wishlistGuestTotalCount', coalesce(total_count, 0)));
END $$;

CREATE OR REPLACE FUNCTION public.sharing_update_owner_settings(
  p_actor_id uuid,
  p_nickname text,
  p_bio text,
  p_profile_share_style boolean,
  p_root_collection_visibility public.sharing_audience,
  p_root_share_financials boolean,
  p_root_wishlist_visibility public.sharing_audience,
  p_wishlist_link_enabled boolean,
  p_wishlist_share_token text,
  p_expected_revision bigint
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  settings public.user_settings%ROWTYPE;
  revision bigint;
  display_name text;
  publishing boolean;
  visible_count bigint;
  total_count bigint;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'authentication_required', 'status', 401));
  END IF;
  IF p_bio IS NULL OR char_length(p_bio) > 500 OR p_profile_share_style IS NULL
     OR p_root_collection_visibility IS NULL OR p_root_share_financials IS NULL
     OR p_root_wishlist_visibility IS NULL OR p_wishlist_link_enabled IS NULL
     OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  display_name := nullif(btrim(coalesce(p_nickname, '')), '');
  IF p_nickname IS NOT NULL AND display_name IS NULL AND btrim(p_nickname) <> '' THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  IF display_name IS NOT NULL AND char_length(display_name) > 64 THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;
  IF p_wishlist_share_token IS NOT NULL AND (
       char_length(p_wishlist_share_token) NOT BETWEEN 8 AND 128
       OR p_wishlist_share_token !~ '^[A-Za-z0-9_-]+$') THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
  END IF;

  PERFORM sharing_private.lock_accounts(p_actor_id);
  SELECT sharing_revision INTO revision FROM public.users WHERE id = p_actor_id;
  IF revision IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  IF revision <> p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'revision_conflict', 'status', 409));
  END IF;
  SELECT * INTO settings FROM public.user_settings WHERE user_id = p_actor_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;

  publishing := p_wishlist_link_enabled
    OR p_root_collection_visibility <> 'private'
    OR p_root_wishlist_visibility <> 'private'
    OR p_profile_share_style;
  IF publishing AND NOT sharing_private.owner_is_publishable(p_actor_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'mutation_forbidden', 'status', 403));
  END IF;

  IF p_wishlist_link_enabled AND settings.wishlist_share_token IS NULL THEN
    IF p_wishlist_share_token IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
    END IF;
    settings.wishlist_share_token := p_wishlist_share_token;
  END IF;

  UPDATE public.users SET name = coalesce(display_name, '') WHERE id = p_actor_id;

  INSERT INTO public.public_profiles (user_id, bio)
    VALUES (p_actor_id, p_bio)
    ON CONFLICT (user_id) DO UPDATE
      SET bio = EXCLUDED.bio, updated_at = now();

  UPDATE public.user_settings SET
    profile_share_style = p_profile_share_style,
    root_collection_visibility = p_root_collection_visibility,
    root_share_financials = p_root_share_financials,
    root_wishlist_visibility = p_root_wishlist_visibility,
    wishlist_link_enabled = p_wishlist_link_enabled,
    wishlist_share_token = settings.wishlist_share_token
    WHERE user_id = p_actor_id;

  SELECT sharing_revision INTO revision FROM public.users WHERE id = p_actor_id;
  SELECT count(*) INTO total_count FROM public.items WHERE user_id = p_actor_id AND is_wishlist;
  SELECT count(*) INTO visible_count FROM public.items i
    WHERE i.user_id = p_actor_id AND sharing_private.wishlist_item_is_visible(i.id, NULL);
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'revision', revision::text,
    'wishlistShareToken', settings.wishlist_share_token,
    'wishlistGuestVisibleCount', coalesce(visible_count, 0),
    'wishlistGuestTotalCount', coalesce(total_count, 0)));
EXCEPTION
  WHEN serialization_failure THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'revision_conflict', 'status', 409));
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'invalid_input', 'status', 400));
END $$;

CREATE OR REPLACE FUNCTION sharing_private.bump_user_name_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    PERFORM sharing_private.lock_accounts(NEW.id);
    UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id = NEW.id;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION sharing_private.bump_user_name_revision() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS sharing_users_name_revision ON public.users;
CREATE TRIGGER sharing_users_name_revision AFTER UPDATE OF name ON public.users
  FOR EACH ROW EXECUTE FUNCTION sharing_private.bump_user_name_revision();

ALTER TABLE public.public_profiles DROP COLUMN IF EXISTS nickname;
ALTER TABLE public.user_settings DROP COLUMN IF EXISTS use_custom_display_name;

REVOKE ALL ON FUNCTION sharing_private.public_identity(uuid), sharing_private.display_nickname(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sharing_private.public_identity(uuid), sharing_private.display_nickname(uuid)
  TO service_role;

COMMIT;

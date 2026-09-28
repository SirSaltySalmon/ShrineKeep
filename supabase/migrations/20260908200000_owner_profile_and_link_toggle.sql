-- W4: rename the share-link toggle, gate token resolution on it, and add a
-- transactional owner write for public_profiles + root audiences.
BEGIN;

ALTER TABLE public.user_settings
  RENAME COLUMN wishlist_is_public TO wishlist_link_enabled;

COMMENT ON COLUMN public.user_settings.wishlist_link_enabled IS
  'Share link toggle only. On: /wishlist/[token] resolves. Off: it 404s. Does not affect item visibility.';

CREATE OR REPLACE FUNCTION public.sharing_resolve_wishlist_token(p_token text, p_viewer_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE owner_id uuid; context jsonb;
BEGIN
  IF p_token IS NULL OR char_length(p_token) NOT BETWEEN 8 AND 128 OR p_token !~ '^[A-Za-z0-9_-]+$' THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  SELECT s.user_id INTO owner_id
    FROM public.user_settings s
   WHERE s.wishlist_share_token = p_token
     AND s.wishlist_link_enabled;
  IF owner_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  context := public.sharing_read_context(owner_id, p_viewer_id);
  IF NOT (context->>'ok')::boolean THEN RETURN context; END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('ownerId',owner_id));
END $$;

CREATE FUNCTION public.sharing_read_owner_settings(p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE settings public.user_settings%ROWTYPE; profile public.public_profiles%ROWTYPE; revision bigint;
  visible_count bigint; total_count bigint;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','authentication_required','status',401));
  END IF;
  PERFORM sharing_private.lock_accounts(p_actor_id);
  SELECT * INTO settings FROM public.user_settings WHERE user_id = p_actor_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  SELECT * INTO profile FROM public.public_profiles WHERE user_id = p_actor_id;
  SELECT sharing_revision INTO revision FROM public.users WHERE id = p_actor_id;
  SELECT count(*) INTO total_count FROM public.items WHERE user_id = p_actor_id AND is_wishlist;
  SELECT count(*) INTO visible_count FROM public.items i
    WHERE i.user_id = p_actor_id AND sharing_private.wishlist_item_is_visible(i.id, NULL);
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
    'revision', revision::text,
    'nickname', profile.nickname,
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

CREATE FUNCTION public.sharing_update_owner_settings(
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
  nickname text;
  publishing boolean;
  visible_count bigint;
  total_count bigint;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','authentication_required','status',401));
  END IF;
  IF p_bio IS NULL OR char_length(p_bio) > 500 OR p_profile_share_style IS NULL
     OR p_root_collection_visibility IS NULL OR p_root_share_financials IS NULL
     OR p_root_wishlist_visibility IS NULL OR p_wishlist_link_enabled IS NULL
     OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  nickname := nullif(btrim(coalesce(p_nickname, '')), '');
  IF p_nickname IS NOT NULL AND nickname IS NULL AND btrim(p_nickname) <> '' THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  IF nickname IS NOT NULL AND char_length(nickname) > 64 THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  IF p_wishlist_share_token IS NOT NULL AND (
       char_length(p_wishlist_share_token) NOT BETWEEN 8 AND 128
       OR p_wishlist_share_token !~ '^[A-Za-z0-9_-]+$') THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;

  PERFORM sharing_private.lock_accounts(p_actor_id);
  SELECT sharing_revision INTO revision FROM public.users WHERE id = p_actor_id;
  IF revision IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  IF revision <> p_expected_revision THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','revision_conflict','status',409));
  END IF;
  SELECT * INTO settings FROM public.user_settings WHERE user_id = p_actor_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;

  publishing := p_wishlist_link_enabled
    OR p_root_collection_visibility <> 'private'
    OR p_root_wishlist_visibility <> 'private'
    OR p_profile_share_style;
  IF publishing AND NOT sharing_private.owner_is_publishable(p_actor_id) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','mutation_forbidden','status',403));
  END IF;

  IF p_wishlist_link_enabled AND settings.wishlist_share_token IS NULL THEN
    IF p_wishlist_share_token IS NULL THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
    END IF;
    settings.wishlist_share_token := p_wishlist_share_token;
  END IF;

  INSERT INTO public.public_profiles (user_id, nickname, bio)
    VALUES (p_actor_id, nickname, p_bio)
    ON CONFLICT (user_id) DO UPDATE
      SET nickname = EXCLUDED.nickname, bio = EXCLUDED.bio, updated_at = now();

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
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
    'revision', revision::text,
    'wishlistShareToken', settings.wishlist_share_token,
    'wishlistGuestVisibleCount', coalesce(visible_count, 0),
    'wishlistGuestTotalCount', coalesce(total_count, 0)));
EXCEPTION
  WHEN serialization_failure THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','revision_conflict','status',409));
  WHEN check_violation THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
END $$;

REVOKE ALL ON FUNCTION public.sharing_read_owner_settings(uuid),
  public.sharing_update_owner_settings(uuid,text,text,boolean,public.sharing_audience,boolean,public.sharing_audience,boolean,text,bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sharing_read_owner_settings(uuid),
  public.sharing_update_owner_settings(uuid,text,text,boolean,public.sharing_audience,boolean,public.sharing_audience,boolean,text,bigint)
  TO service_role;

COMMIT;

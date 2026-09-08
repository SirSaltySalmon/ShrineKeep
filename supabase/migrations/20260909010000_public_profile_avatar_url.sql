-- Public profiles publish users.avatar_url. Avatars are a public bucket and are
-- not signed like item photos. SQL still returns avatar as null; TypeScript
-- allowlists the URL into PublicMedia.
BEGIN;

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
  owner_avatar text;
  style jsonb;
BEGIN
  IF NOT sharing_private.owner_is_publishable(p_owner_id) OR sharing_private.pair_is_blocked(p_viewer_id, p_owner_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code', 'not_found', 'status', 404));
  END IF;
  SELECT sharing_revision, name, avatar_url INTO revision, owner_name, owner_avatar FROM public.users WHERE id = p_owner_id;
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
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'revision', revision::text, 'viewerCategory', category,
    'profile', jsonb_build_object('id', p_owner_id,
      'nickname', coalesce(nullif(btrim(owner_name), ''), 'Collector-' || right(p_owner_id::text, 8)),
      'bio', coalesce(profile.bio, ''), 'avatar', NULL, 'avatarUrl', nullif(btrim(owner_avatar), ''),
      'sharedStyle', style, 'relationship', relation)));
END $$;

COMMIT;

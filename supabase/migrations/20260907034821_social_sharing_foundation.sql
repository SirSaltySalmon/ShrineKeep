-- T01 additive foundation. Requires the existing ShrineKeep schema through
-- 20260906192956. Do not enable public/social features until reconciliation,
-- canonical service reads, private media and legacy grant revocation are complete.
BEGIN;

CREATE SCHEMA IF NOT EXISTS sharing_private;
REVOKE ALL ON SCHEMA sharing_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA sharing_private TO service_role;

CREATE TYPE public.sharing_audience AS ENUM ('private', 'friends', 'public');

ALTER TABLE public.users
  ADD COLUMN public_access_disabled_at timestamptz,
  ADD COLUMN sharing_revision bigint NOT NULL DEFAULT 0 CHECK (sharing_revision >= 0);

ALTER TABLE public.boxes
  ADD COLUMN collection_visibility public.sharing_audience NOT NULL DEFAULT 'private',
  ADD COLUMN share_financials boolean NOT NULL DEFAULT false,
  ADD COLUMN wishlist_visibility public.sharing_audience NOT NULL DEFAULT 'private';

ALTER TABLE public.items
  ADD COLUMN wishlist_is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN wishlist_detached_visibility public.sharing_audience;

ALTER TABLE public.user_settings
  ADD COLUMN root_wishlist_visibility public.sharing_audience NOT NULL DEFAULT 'private',
  ADD COLUMN profile_share_style boolean NOT NULL DEFAULT false;

-- No provider name/avatar backfill. Public identity requires deliberate consent.
CREATE TABLE public.public_profiles (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  nickname text CHECK (nickname IS NULL OR (nickname = btrim(nickname) AND char_length(nickname) BETWEEN 1 AND 64)),
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Transitional name avoids mutating legacy directional relationships in place.
-- T01 reconciliation will retire public.friendships before canonical cutover.
CREATE TABLE public.social_friendships (
  user_low uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  user_high uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  request_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high),
  CHECK (requested_by IN (user_low, user_high)),
  CHECK ((status = 'pending' AND accepted_at IS NULL) OR (status = 'accepted' AND accepted_at IS NOT NULL)),
  CHECK (accepted_at IS NULL OR accepted_at >= created_at)
);

CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE public.social_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('request', 'acceptance')),
  event_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  resolved_at timestamptz,
  UNIQUE (recipient_id, event_id, kind),
  CHECK (recipient_id <> actor_id)
);

CREATE TABLE sharing_private.social_rate_limits (
  actor_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (actor_id, scope, window_start)
);

CREATE INDEX social_friends_low_accepted ON public.social_friendships (user_low, accepted_at DESC, user_high) WHERE status = 'accepted';
CREATE INDEX social_friends_high_accepted ON public.social_friendships (user_high, accepted_at DESC, user_low) WHERE status = 'accepted';
CREATE INDEX social_requests_low ON public.social_friendships (user_low, created_at DESC, request_id DESC) WHERE status = 'pending';
CREATE INDEX social_requests_high ON public.social_friendships (user_high, created_at DESC, request_id DESC) WHERE status = 'pending';
CREATE INDEX user_blocks_reverse ON public.user_blocks (blocked_id, blocker_id);
CREATE INDEX social_notifications_page ON public.social_notifications (recipient_id, created_at DESC, id DESC);
CREATE INDEX social_notifications_unread ON public.social_notifications (recipient_id, created_at DESC, id DESC) WHERE read_at IS NULL AND resolved_at IS NULL;
CREATE INDEX social_rate_limits_expiry ON sharing_private.social_rate_limits (expires_at);
CREATE INDEX sharing_boxes_children ON public.boxes (user_id, parent_box_id, position, id);
CREATE INDEX sharing_boxes_audience ON public.boxes (user_id, collection_visibility, position, id);
CREATE INDEX sharing_items_owned ON public.items (user_id, box_id, is_wishlist, position, id);
CREATE INDEX sharing_items_wishlist ON public.items (user_id, wishlist_target_box_id, created_at DESC, id DESC) WHERE is_wishlist AND NOT wishlist_is_private;

-- New tables are service-only, even on projects with permissive default grants.
ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharing_private.social_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_profiles, public.social_friendships, public.user_blocks,
  public.social_notifications, sharing_private.social_rate_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.public_profiles, public.social_friendships,
  public.user_blocks, public.social_notifications, sharing_private.social_rate_limits TO service_role;

-- Keep operational account state immutable to existing direct owner UPDATE grants.
-- Invoker context ensures this checks the real database role, not editable JWT data.
CREATE FUNCTION sharing_private.protect_publication_state() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin') AND
     (NEW.public_access_disabled_at IS DISTINCT FROM OLD.public_access_disabled_at OR
      NEW.sharing_revision IS DISTINCT FROM OLD.sharing_revision) THEN
    RAISE EXCEPTION 'publication state is service controlled' USING ERRCODE = '42501';
  END IF;
  IF NEW.sharing_revision < OLD.sharing_revision THEN
    RAISE EXCEPTION 'sharing revision cannot decrease' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sharing_private.protect_publication_state() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER protect_publication_state BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION sharing_private.protect_publication_state();

-- Predicates are deliberately inaccessible to Data API callers. Server services
-- resolve the viewer from verified credentials; these functions never accept JWT metadata.
CREATE FUNCTION sharing_private.owner_is_publishable(owner_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id = owner_id
    AND NOT u.is_sandbox AND u.public_access_disabled_at IS NULL);
$$;

CREATE FUNCTION sharing_private.pair_is_blocked(viewer_id uuid, owner_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT viewer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_blocks b
    WHERE (b.blocker_id = viewer_id AND b.blocked_id = owner_id)
       OR (b.blocker_id = owner_id AND b.blocked_id = viewer_id));
$$;

CREATE FUNCTION sharing_private.pair_is_friends(viewer_id uuid, owner_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT viewer_id IS NOT NULL AND NOT sharing_private.pair_is_blocked(viewer_id, owner_id)
    AND EXISTS (SELECT 1 FROM public.social_friendships f
      WHERE f.user_low = least(viewer_id, owner_id) AND f.user_high = greatest(viewer_id, owner_id)
      AND f.status = 'accepted');
$$;

CREATE FUNCTION sharing_private.audience_allows(audience public.sharing_audience, viewer_id uuid, owner_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT sharing_private.owner_is_publishable(owner_id)
    AND NOT sharing_private.pair_is_blocked(viewer_id, owner_id)
    AND coalesce((audience = 'public' OR (audience = 'friends' AND
      (viewer_id = owner_id OR sharing_private.pair_is_friends(viewer_id, owner_id)))), false);
$$;

CREATE FUNCTION sharing_private.wishlist_item_is_visible(item_id uuid, viewer_id uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.items i
    LEFT JOIN public.boxes b ON b.id = i.wishlist_target_box_id AND b.user_id = i.user_id
    LEFT JOIN public.user_settings s ON s.user_id = i.user_id
    WHERE i.id = item_id AND i.is_wishlist AND NOT i.wishlist_is_private
      -- Invalid/cross-owner targets fail closed before integrity reconciliation.
      AND (i.wishlist_target_box_id IS NULL OR b.id IS NOT NULL)
      AND sharing_private.audience_allows(
        CASE WHEN i.wishlist_target_box_id IS NOT NULL THEN b.wishlist_visibility
        ELSE coalesce(i.wishlist_detached_visibility, s.root_wishlist_visibility, 'private') END,
        viewer_id, i.user_id)
  );
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sharing_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA sharing_private TO service_role;
COMMIT;

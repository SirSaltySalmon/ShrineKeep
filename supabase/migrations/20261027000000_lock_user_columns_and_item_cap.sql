-- RLS decides which rows a caller may touch, not which columns. The owner
-- UPDATE policy on public.users let any signed-in user rewrite their own
-- grandfathered_item_count (free-tier cap bypass), email (UNIQUE: squat a
-- victim's address so handle_new_user fails their signup) and username.
-- The item cap was also only enforced in API routes; direct Data API inserts,
-- wishlist -> collection flips, and paste_box_trees_atomic(p_cap => NULL)
-- skipped it.
BEGIN;

-- Owners may only edit what the app edits: settings + avatar routes.
REVOKE UPDATE ON public.users FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name, avatar_url, updated_at) ON public.users TO authenticated;

-- Mirrors FREE_TIER_CAP, PAST_DUE_GRACE_DAYS and getEffectiveCap in lib/subscription.ts.
-- Invoker context so current_user is the real database role (as in
-- protect_publication_state) and reads stay under the caller's RLS.
CREATE FUNCTION sharing_private.enforce_item_cap() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_cap integer;
  v_count integer;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  -- Already a collection item for this owner: not a new slot.
  IF TG_OP = 'UPDATE' AND NOT OLD.is_wishlist AND NEW.user_id = OLD.user_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = NEW.user_id
      AND (s.status = 'active'
        OR (s.status = 'past_due' AND now() <= s.current_period_end + interval '7 days'))
  ) THEN
    RETURN NEW;
  END IF;

  -- Serialize cap decisions per user, matching paste_box_trees_atomic.
  SELECT greatest(coalesce(u.grandfathered_item_count, 0), 100) INTO v_cap
  FROM public.users u WHERE u.id = NEW.user_id FOR UPDATE;
  v_cap := coalesce(v_cap, 100);

  -- BEFORE ROW: rows inserted earlier in the same statement are visible here.
  SELECT count(*) INTO v_count FROM public.items i
  WHERE i.user_id = NEW.user_id AND NOT i.is_wishlist;

  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'item_limit_reached:%:%', v_count, v_cap USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sharing_private.enforce_item_cap() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_item_cap BEFORE INSERT OR UPDATE OF is_wishlist, user_id ON public.items
  FOR EACH ROW WHEN (NOT NEW.is_wishlist) EXECUTE FUNCTION sharing_private.enforce_item_cap();

COMMIT;

-- Remove R16: wishlist privacy is only the container audience (box or root).
-- There is no per-item Private veto.
BEGIN;

DROP INDEX IF EXISTS public.sharing_items_wishlist;
CREATE INDEX sharing_items_wishlist ON public.items
  (user_id, wishlist_target_box_id, created_at DESC, id DESC)
  WHERE is_wishlist;

CREATE OR REPLACE FUNCTION sharing_private.wishlist_item_is_visible(item_id uuid, viewer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_id AND i.is_wishlist
      AND sharing_private.audience_allows(
        CASE WHEN i.wishlist_target_box_id IS NOT NULL THEN
          sharing_private.container_audience(i.user_id, i.wishlist_target_box_id, 'wishlist')
        ELSE
          coalesce(i.wishlist_detached_visibility, sharing_private.container_audience(i.user_id, NULL, 'wishlist'))
        END,
        viewer_id, i.user_id)
  );
$$;

CREATE OR REPLACE FUNCTION sharing_private.guard_item_targets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid; old_audience public.sharing_audience; new_audience public.sharing_audience;
BEGIN
  owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'invalid owner' USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'item ownership cannot change' USING ERRCODE='23514';
  END IF;
  PERFORM sharing_private.lock_accounts(owner_id);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF NEW.box_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.boxes WHERE id=NEW.box_id AND user_id=owner_id) THEN
    RAISE EXCEPTION 'invalid collection target' USING ERRCODE='23514';
  END IF;
  IF NEW.wishlist_target_box_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.boxes WHERE id=NEW.wishlist_target_box_id AND user_id=owner_id) THEN
    RAISE EXCEPTION 'invalid wishlist target' USING ERRCODE='23514';
  END IF;
  IF TG_OP='INSERT' THEN
    IF current_setting('role',true) IN ('anon','authenticated') THEN NEW.wishlist_detached_visibility:=NULL; END IF;
    IF NEW.wishlist_target_box_id IS NOT NULL THEN NEW.wishlist_detached_visibility:=NULL; END IF;
    RETURN NEW;
  END IF;
  IF OLD.wishlist_target_box_id IS NOT NULL THEN
    old_audience := sharing_private.container_audience(owner_id, OLD.wishlist_target_box_id, 'wishlist');
  ELSE
    old_audience := coalesce(OLD.wishlist_detached_visibility, sharing_private.container_audience(owner_id, NULL, 'wishlist'));
  END IF;
  IF NEW.wishlist_target_box_id IS DISTINCT FROM OLD.wishlist_target_box_id THEN
    IF NEW.wishlist_target_box_id IS NULL THEN NEW.wishlist_detached_visibility:=old_audience;
    ELSE NEW.wishlist_detached_visibility:=NULL; END IF;
  ELSIF NEW.wishlist_detached_visibility IS DISTINCT FROM OLD.wishlist_detached_visibility AND current_setting('role',true) IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'detached visibility is service controlled' USING ERRCODE='42501';
  END IF;
  IF NEW.wishlist_target_box_id IS NOT NULL THEN
    new_audience := sharing_private.container_audience(owner_id, NEW.wishlist_target_box_id, 'wishlist');
  ELSE
    new_audience := coalesce(NEW.wishlist_detached_visibility, sharing_private.container_audience(owner_id, NULL, 'wishlist'));
  END IF;
  IF OLD.is_wishlist AND NEW.is_wishlist AND
     NEW.wishlist_target_box_id IS DISTINCT FROM OLD.wishlist_target_box_id AND new_audience > old_audience THEN
    -- Box-delete move-up may land a wishlist target on a wider surviving ancestor.
    -- R27 accepts that broadening; ordinary owner moves still raise privacy_conflict.
    IF current_setting('sharing_private.allow_move_up_retarget', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'privacy_conflict' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

ALTER TABLE public.items DROP COLUMN wishlist_is_private;

COMMIT;

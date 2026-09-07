-- T04 item ownership and wishlist detachment. Explicit broadening workflow and
-- acquisition publication remain to be wired before feature enablement.
BEGIN;
CREATE FUNCTION sharing_private.guard_item_targets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid; root_audience public.sharing_audience; old_audience public.sharing_audience; new_audience public.sharing_audience;
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
  IF (NEW.wishlist_target_box_id IS DISTINCT FROM OLD.wishlist_target_box_id OR NEW.box_id IS DISTINCT FROM OLD.box_id OR NEW.is_wishlist IS DISTINCT FROM OLD.is_wishlist) AND OLD.wishlist_is_private THEN
    NEW.wishlist_is_private:=true;
  END IF;
  SELECT coalesce(root_wishlist_visibility,'private') INTO root_audience FROM public.user_settings WHERE user_id=owner_id;
  root_audience:=coalesce(root_audience,'private');
  IF OLD.wishlist_target_box_id IS NOT NULL THEN
    SELECT wishlist_visibility INTO old_audience FROM public.boxes WHERE id=OLD.wishlist_target_box_id AND user_id=owner_id;
    old_audience:=coalesce(old_audience,'private');
  ELSE old_audience:=coalesce(OLD.wishlist_detached_visibility,root_audience); END IF;
  IF NEW.wishlist_target_box_id IS DISTINCT FROM OLD.wishlist_target_box_id THEN
    IF NEW.wishlist_target_box_id IS NULL THEN NEW.wishlist_detached_visibility:=old_audience;
    ELSE NEW.wishlist_detached_visibility:=NULL; END IF;
  ELSIF NEW.wishlist_detached_visibility IS DISTINCT FROM OLD.wishlist_detached_visibility AND current_setting('role',true) IN ('anon','authenticated') THEN
    RAISE EXCEPTION 'detached visibility is service controlled' USING ERRCODE='42501';
  END IF;
  IF NEW.wishlist_target_box_id IS NOT NULL THEN
    SELECT wishlist_visibility INTO new_audience FROM public.boxes WHERE id=NEW.wishlist_target_box_id AND user_id=owner_id;
  ELSE new_audience:=coalesce(NEW.wishlist_detached_visibility,root_audience); END IF;
  -- Enum order is Private < Friends < Public. Explicit item Private is a veto.
  IF OLD.is_wishlist AND NEW.is_wishlist AND NOT NEW.wishlist_is_private AND
     NEW.wishlist_target_box_id IS DISTINCT FROM OLD.wishlist_target_box_id AND new_audience > old_audience THEN
    RAISE EXCEPTION 'privacy_conflict' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION sharing_private.preserve_deleted_box_wishlist() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM sharing_private.lock_accounts(OLD.user_id);
  -- Runs before the target row disappears, so the item trigger can read its
  -- saved audience. Surviving items never inherit a broader account default.
  UPDATE public.items SET wishlist_target_box_id=NULL
    WHERE user_id=OLD.user_id AND wishlist_target_box_id=OLD.id;
  RETURN OLD;
END $$;

CREATE FUNCTION sharing_private.bump_item_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN
    FOR owner_id IN SELECT DISTINCT user_id FROM old_items ORDER BY user_id LOOP
      UPDATE public.users SET sharing_revision=sharing_revision+1 WHERE id=owner_id;
    END LOOP;
  ELSE
    FOR owner_id IN SELECT DISTINCT user_id FROM new_items ORDER BY user_id LOOP
      UPDATE public.users SET sharing_revision=sharing_revision+1 WHERE id=owner_id;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER sharing_items_statement BEFORE INSERT OR UPDATE OR DELETE ON public.items
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.lock_box_statement();
CREATE TRIGGER sharing_items_targets BEFORE INSERT OR UPDATE OR DELETE ON public.items
  FOR EACH ROW EXECUTE FUNCTION sharing_private.guard_item_targets();
CREATE TRIGGER sharing_items_insert_revision AFTER INSERT ON public.items REFERENCING NEW TABLE AS new_items
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_revision();
CREATE TRIGGER sharing_items_update_revision AFTER UPDATE ON public.items REFERENCING NEW TABLE AS new_items
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_revision();
CREATE TRIGGER sharing_items_delete_revision AFTER DELETE ON public.items REFERENCING OLD TABLE AS old_items
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_item_revision();
CREATE TRIGGER sharing_boxes_preserve_wishlist BEFORE DELETE ON public.boxes
  FOR EACH ROW EXECUTE FUNCTION sharing_private.preserve_deleted_box_wishlist();
REVOKE ALL ON FUNCTION sharing_private.guard_item_targets(),sharing_private.preserve_deleted_box_wishlist(),sharing_private.bump_item_revision() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

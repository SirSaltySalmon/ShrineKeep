-- T04: enforce box inheritance/integrity on all SQL writers, including direct clients.
BEGIN;
CREATE FUNCTION sharing_private.lock_box_statement() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Authenticated direct writes acquire the owner lock before tuple locks.
  -- Trusted service RPCs must acquire ordered account locks before writing.
  IF auth.uid() IS NOT NULL THEN PERFORM sharing_private.lock_accounts(auth.uid()); END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION sharing_private.guard_box_tree() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE parent public.boxes%ROWTYPE; owner_id uuid; invalid_tree boolean;
BEGIN
  owner_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  IF current_setting('role',true) IN ('anon','authenticated') AND auth.uid() IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'invalid owner' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'box ownership cannot change' USING ERRCODE = '23514';
  END IF;
  PERFORM sharing_private.lock_accounts(owner_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.parent_box_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.parent_box_id IS DISTINCT FROM OLD.parent_box_id) THEN
    SELECT * INTO parent FROM public.boxes WHERE id = NEW.parent_box_id AND user_id = NEW.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'invalid parent' USING ERRCODE = '23514'; END IF;
    WITH RECURSIVE ancestors(id,parent_id) AS (
      SELECT parent.id,parent.parent_box_id UNION ALL
      SELECT b.id,b.parent_box_id FROM public.boxes b JOIN ancestors a ON b.id = a.parent_id WHERE b.user_id = NEW.user_id
    ) CYCLE id SET cyclic USING path
    SELECT bool_or(cyclic OR id = NEW.id) INTO invalid_tree FROM ancestors;
    IF invalid_tree THEN RAISE EXCEPTION 'invalid hierarchy' USING ERRCODE = '23514'; END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.parent_box_id IS NULL THEN
      NEW.collection_visibility := 'private'; NEW.share_financials := false; NEW.wishlist_visibility := 'private';
    ELSE
      NEW.collection_visibility := parent.collection_visibility;
      NEW.share_financials := parent.share_financials;
      NEW.wishlist_visibility := parent.wishlist_visibility;
    END IF;
  END IF;
  IF (NEW.collection_visibility <> 'private' OR NEW.wishlist_visibility <> 'private') AND
     NOT sharing_private.owner_is_publishable(NEW.user_id) THEN
    RAISE EXCEPTION 'publication unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION sharing_private.bump_box_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE owner_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    FOR owner_id IN SELECT DISTINCT user_id FROM old_boxes ORDER BY user_id LOOP
      UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id = owner_id;
    END LOOP;
  ELSE
    FOR owner_id IN SELECT DISTINCT user_id FROM new_boxes ORDER BY user_id LOOP
      UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id = owner_id;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER sharing_boxes_statement BEFORE INSERT OR UPDATE OR DELETE ON public.boxes
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.lock_box_statement();
CREATE TRIGGER sharing_boxes_tree BEFORE INSERT OR UPDATE OR DELETE ON public.boxes
  FOR EACH ROW EXECUTE FUNCTION sharing_private.guard_box_tree();
CREATE TRIGGER sharing_boxes_insert_revision AFTER INSERT ON public.boxes REFERENCING NEW TABLE AS new_boxes
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_box_revision();
CREATE TRIGGER sharing_boxes_update_revision AFTER UPDATE ON public.boxes REFERENCING NEW TABLE AS new_boxes
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_box_revision();
CREATE TRIGGER sharing_boxes_delete_revision AFTER DELETE ON public.boxes REFERENCING OLD TABLE AS old_boxes
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.bump_box_revision();
REVOKE ALL ON FUNCTION sharing_private.lock_box_statement(),sharing_private.guard_box_tree(),sharing_private.bump_box_revision() FROM PUBLIC,anon,authenticated,service_role;

-- Existing legacy links/cycles are not silently repaired. Guards protect new
-- hierarchy changes; an explicit reconciliation/constraint-validation gate remains.
COMMIT;

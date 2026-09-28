-- T04 contents-surviving delete: reparent one level to the nearest surviving
-- ancestor instead of flattening the subtree to the collection root.
BEGIN;

CREATE FUNCTION sharing_private.move_up_destinations(p_owner_id uuid, p_deleted uuid[])
RETURNS TABLE(deleted_id uuid, destination_id uuid)
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH RECURSIVE walk(deleted_id, candidate) AS (
    SELECT b.id, b.parent_box_id
    FROM public.boxes b
    WHERE b.user_id = p_owner_id AND b.id = ANY (p_deleted)
    UNION ALL
    SELECT w.deleted_id, parent.parent_box_id
    FROM walk w
    JOIN public.boxes parent ON parent.id = w.candidate AND parent.user_id = p_owner_id
    WHERE w.candidate = ANY (p_deleted)
  ) CYCLE candidate SET cyclic USING path
  SELECT walk.deleted_id, walk.candidate
  FROM walk
  WHERE NOT walk.cyclic
    AND (walk.candidate IS NULL OR NOT (walk.candidate = ANY (p_deleted)));
$$;

REVOKE ALL ON FUNCTION sharing_private.move_up_destinations(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sharing_private.move_up_destinations(uuid, uuid[]) TO service_role;

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
  IF (NEW.wishlist_target_box_id IS DISTINCT FROM OLD.wishlist_target_box_id OR NEW.box_id IS DISTINCT FROM OLD.box_id OR NEW.is_wishlist IS DISTINCT FROM OLD.is_wishlist) AND OLD.wishlist_is_private THEN
    NEW.wishlist_is_private:=true;
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
  IF OLD.is_wishlist AND NEW.is_wishlist AND NOT NEW.wishlist_is_private AND
     NEW.wishlist_target_box_id IS DISTINCT FROM OLD.wishlist_target_box_id AND new_audience > old_audience THEN
    -- Box-delete move-up may land a wishlist target on a wider surviving ancestor.
    -- R27 accepts that broadening; ordinary owner moves still raise privacy_conflict.
    -- The explicit Private flag is never cleared here (the NOT wishlist_is_private
    -- predicate above is the veto).
    IF current_setting('sharing_private.allow_move_up_retarget', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'privacy_conflict' USING ERRCODE='P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sharing_delete_boxes(p_actor_id uuid, p_box_ids uuid[], p_mode text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  unique_ids uuid[];
  subtree_ids uuid[];
  found_count bigint;
  has_cycle boolean;
  revision bigint;
  photos jsonb := '[]'::jsonb;
  dest_count bigint;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','authentication_required','status',401));
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('delete-all','move-up') OR p_box_ids IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  SELECT array_agg(DISTINCT id) INTO unique_ids FROM unnest(p_box_ids) ids(id) WHERE id IS NOT NULL;
  IF unique_ids IS NULL OR coalesce(array_length(unique_ids,1),0) = 0 OR array_length(unique_ids,1) > 200
     OR exists (SELECT 1 FROM unnest(p_box_ids) ids(id) WHERE id IS NULL) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  PERFORM sharing_private.lock_accounts(p_actor_id);
  SELECT count(*) INTO found_count FROM public.boxes WHERE user_id = p_actor_id AND id = ANY (unique_ids);
  IF found_count <> array_length(unique_ids,1) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  WITH RECURSIVE subtree(id) AS (
    SELECT b.id FROM public.boxes b WHERE b.user_id = p_actor_id AND b.id = ANY (unique_ids)
    UNION ALL
    SELECT c.id FROM public.boxes c JOIN subtree s ON c.parent_box_id = s.id WHERE c.user_id = p_actor_id
  ) CYCLE id SET cyclic USING path
  SELECT array_agg(DISTINCT id), bool_or(cyclic) INTO subtree_ids, has_cycle FROM subtree;
  IF has_cycle OR subtree_ids IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  IF p_mode = 'delete-all' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'storage_path',p.storage_path,'asset_id',p.asset_id)),'[]'::jsonb)
      INTO photos
      FROM public.photos p
      JOIN public.items i ON i.id = p.item_id
      WHERE i.user_id = p_actor_id AND i.box_id = ANY (subtree_ids);
    DELETE FROM public.boxes WHERE user_id = p_actor_id AND id = ANY (unique_ids);
  ELSE
    DROP TABLE IF EXISTS pg_temp.move_up_dest;
    CREATE TEMP TABLE pg_temp.move_up_dest AS
      SELECT d.deleted_id, d.destination_id
      FROM sharing_private.move_up_destinations(p_actor_id, unique_ids) d;
    SELECT count(*) INTO dest_count FROM pg_temp.move_up_dest;
    IF dest_count IS DISTINCT FROM array_length(unique_ids,1) THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
    END IF;
    UPDATE public.boxes b SET parent_box_id = d.destination_id
      FROM pg_temp.move_up_dest d
      WHERE b.user_id = p_actor_id
        AND b.parent_box_id = d.deleted_id
        AND NOT (b.id = ANY (unique_ids));
    UPDATE public.items i SET box_id = d.destination_id
      FROM pg_temp.move_up_dest d
      WHERE i.user_id = p_actor_id AND i.box_id = d.deleted_id;
    BEGIN
      PERFORM set_config('sharing_private.allow_move_up_retarget', 'on', true);
      UPDATE public.items i SET wishlist_target_box_id = d.destination_id
        FROM pg_temp.move_up_dest d
        WHERE i.user_id = p_actor_id AND i.wishlist_target_box_id = d.deleted_id;
      PERFORM set_config('sharing_private.allow_move_up_retarget', '', true);
    EXCEPTION WHEN OTHERS THEN
      PERFORM set_config('sharing_private.allow_move_up_retarget', '', true);
      RAISE;
    END;
    DELETE FROM public.boxes WHERE user_id = p_actor_id AND id = ANY (unique_ids);
  END IF;
  IF EXISTS (SELECT 1 FROM public.boxes WHERE user_id = p_actor_id AND id = ANY (unique_ids)) THEN
    RAISE EXCEPTION 'hierarchy changed' USING ERRCODE = '40001';
  END IF;
  SELECT sharing_revision INTO revision FROM public.users WHERE id = p_actor_id;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
    'deletedCount',array_length(unique_ids,1),'revision',revision::text,'photos',photos));
EXCEPTION
  WHEN serialization_failure THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','revision_conflict','status',409));
  WHEN raise_exception THEN
    IF SQLERRM = 'privacy_conflict' THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','privacy_conflict','status',409));
    END IF;
    RAISE;
END $$;

COMMIT;

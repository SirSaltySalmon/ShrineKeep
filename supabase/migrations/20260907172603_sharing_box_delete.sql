-- T04 atomic box delete / move-to-root. Direct multi-request helpers cannot
-- keep unbox, reparent, detach, and delete in one lock.
BEGIN;
CREATE FUNCTION public.sharing_delete_boxes(p_actor_id uuid, p_box_ids uuid[], p_mode text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
#variable_conflict use_variable
DECLARE
  unique_ids uuid[];
  subtree_ids uuid[];
  found_count bigint;
  has_cycle boolean;
  revision bigint;
  photos jsonb := '[]'::jsonb;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','authentication_required','status',401));
  END IF;
  IF p_mode IS NULL OR p_mode NOT IN ('delete-all','move-to-root') OR p_box_ids IS NULL THEN
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
    UPDATE public.items SET box_id = NULL
      WHERE user_id = p_actor_id AND box_id = ANY (subtree_ids);
    UPDATE public.boxes SET parent_box_id = NULL
      WHERE user_id = p_actor_id AND id = ANY (subtree_ids) AND NOT (id = ANY (unique_ids));
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
REVOKE ALL ON FUNCTION public.sharing_delete_boxes(uuid,uuid[],text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sharing_delete_boxes(uuid,uuid[],text) TO service_role;
COMMIT;

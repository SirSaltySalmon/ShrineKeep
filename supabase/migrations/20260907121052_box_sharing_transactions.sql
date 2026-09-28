-- T04 transaction surface. Existing direct structural writers still require
-- common-lock/revision integration before sharing can be enabled.
BEGIN;
CREATE FUNCTION public.sharing_preview_box(p_actor_id uuid,p_box_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE box public.boxes%ROWTYPE; revision bigint; descendant_count bigint; has_cycle boolean;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','authentication_required','status',401));
  END IF;
  PERFORM sharing_private.lock_accounts(p_actor_id);
  IF NOT sharing_private.owner_is_publishable(p_actor_id) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','mutation_forbidden','status',403));
  END IF;
  SELECT * INTO box FROM public.boxes WHERE id = p_box_id AND user_id = p_actor_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  WITH RECURSIVE subtree(id) AS (
    SELECT box.id UNION ALL
    SELECT b.id FROM public.boxes b JOIN subtree s ON b.parent_box_id = s.id WHERE b.user_id = p_actor_id
  ) CYCLE id SET cyclic USING path
  SELECT count(*) - 1,bool_or(cyclic) INTO descendant_count,has_cycle FROM subtree;
  IF has_cycle THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  SELECT sharing_revision INTO revision FROM public.users WHERE id = p_actor_id;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('revision',revision::text,'descendantCount',descendant_count,
    'settings',jsonb_build_object('collectionVisibility',box.collection_visibility,'shareFinancials',box.share_financials,'wishlistVisibility',box.wishlist_visibility)));
END $$;

CREATE FUNCTION public.sharing_update_box(
  p_actor_id uuid,p_box_id uuid,p_collection_visibility public.sharing_audience,p_share_financials boolean,
  p_wishlist_visibility public.sharing_audience,p_apply_descendants boolean,p_expected_revision bigint,p_expected_descendant_count bigint
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE preview jsonb; revision bigint; changed_count bigint; has_cycle boolean;
BEGIN
  IF p_collection_visibility IS NULL OR p_share_financials IS NULL OR p_wishlist_visibility IS NULL OR p_apply_descendants IS NULL OR
     p_expected_revision IS NULL OR p_expected_revision < 0 OR p_expected_descendant_count IS NULL OR p_expected_descendant_count < 0 THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  -- Preview locks the owner; lock is held through the entire save transaction.
  preview := public.sharing_preview_box(p_actor_id,p_box_id);
  IF NOT (preview->>'ok')::boolean THEN RETURN preview; END IF;
  IF preview->'data'->>'revision' <> p_expected_revision::text OR
     (preview->'data'->>'descendantCount')::bigint <> p_expected_descendant_count THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','revision_conflict','status',409));
  END IF;
  WITH RECURSIVE subtree(id) AS (
    SELECT p_box_id UNION ALL
    SELECT b.id FROM public.boxes b JOIN subtree s ON b.parent_box_id = s.id
      WHERE p_apply_descendants AND b.user_id = p_actor_id
  ) CYCLE id SET cyclic USING path,
  changed AS (
    UPDATE public.boxes b SET collection_visibility = p_collection_visibility,
      share_financials = p_share_financials,wishlist_visibility = p_wishlist_visibility
      WHERE b.user_id = p_actor_id AND b.id IN (SELECT id FROM subtree)
        AND NOT EXISTS (SELECT 1 FROM subtree WHERE cyclic)
      RETURNING b.id
  )
  SELECT (SELECT count(*) FROM changed),(SELECT bool_or(cyclic) FROM subtree) INTO changed_count,has_cycle;
  IF has_cycle THEN RAISE EXCEPTION 'invalid hierarchy' USING ERRCODE = '22023'; END IF;
  IF changed_count <> (CASE WHEN p_apply_descendants THEN p_expected_descendant_count + 1 ELSE 1 END) THEN
    RAISE EXCEPTION 'hierarchy changed' USING ERRCODE = '40001';
  END IF;
  SELECT sharing_revision INTO revision FROM public.users WHERE id = p_actor_id;
  -- Box revision triggers installed by the invariant migration already advance
  -- this value. Keep the earlier migration independently usable without double bumps.
  IF revision::text = preview->'data'->>'revision' THEN
    UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id = p_actor_id RETURNING sharing_revision INTO revision;
  END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('revision',revision::text));
EXCEPTION
  -- Raising and catching rolls back this function's writes before returning a
  -- structured conflict; returning an error directly after UPDATE would not.
  WHEN serialization_failure THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','revision_conflict','status',409));
  WHEN invalid_parameter_value THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
END $$;
REVOKE ALL ON FUNCTION public.sharing_preview_box(uuid,uuid),
  public.sharing_update_box(uuid,uuid,public.sharing_audience,boolean,public.sharing_audience,boolean,bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sharing_preview_box(uuid,uuid),
  public.sharing_update_box(uuid,uuid,public.sharing_audience,boolean,public.sharing_audience,boolean,bigint,bigint) TO service_role;
COMMIT;

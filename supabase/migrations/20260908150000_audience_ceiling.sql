-- Audience ceiling: virtual collection root, container_audience, monotonically
-- narrowing trees, clamp-on-restrict, and public-path tag removal.
BEGIN;

ALTER TABLE public.user_settings
  ADD COLUMN root_collection_visibility public.sharing_audience NOT NULL DEFAULT 'private',
  ADD COLUMN root_share_financials boolean NOT NULL DEFAULT false;

CREATE TYPE sharing_private.audience_dimension AS ENUM ('collection', 'wishlist');

-- The only place that knows root's audience is stored outside `boxes`.
-- Missing settings, missing box, and cross-owner box all fail closed as private.
CREATE FUNCTION sharing_private.container_audience(
  p_owner_id uuid, p_box_id uuid, p_dimension sharing_private.audience_dimension
) RETURNS public.sharing_audience LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(CASE WHEN p_box_id IS NULL THEN
    (SELECT CASE p_dimension WHEN 'collection' THEN s.root_collection_visibility
                             WHEN 'wishlist' THEN s.root_wishlist_visibility END
       FROM public.user_settings s WHERE s.user_id = p_owner_id)
  ELSE
    (SELECT CASE p_dimension WHEN 'collection' THEN b.collection_visibility
                             WHEN 'wishlist' THEN b.wishlist_visibility END
       FROM public.boxes b WHERE b.id = p_box_id AND b.user_id = p_owner_id)
  END, 'private');
$$;

CREATE FUNCTION sharing_private.container_share_financials(p_owner_id uuid, p_box_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT coalesce(CASE WHEN p_box_id IS NULL THEN
    (SELECT s.root_share_financials FROM public.user_settings s WHERE s.user_id = p_owner_id)
  ELSE
    (SELECT b.share_financials FROM public.boxes b WHERE b.id = p_box_id AND b.user_id = p_owner_id)
  END, false);
$$;

REVOKE ALL ON FUNCTION sharing_private.container_audience(uuid,uuid,sharing_private.audience_dimension),
  sharing_private.container_share_financials(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sharing_private.container_audience(uuid,uuid,sharing_private.audience_dimension),
  sharing_private.container_share_financials(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION sharing_private.wishlist_item_is_visible(item_id uuid, viewer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = item_id AND i.is_wishlist AND NOT i.wishlist_is_private
      AND sharing_private.audience_allows(
        CASE WHEN i.wishlist_target_box_id IS NOT NULL THEN
          sharing_private.container_audience(i.user_id, i.wishlist_target_box_id, 'wishlist')
        ELSE
          coalesce(i.wishlist_detached_visibility, sharing_private.container_audience(i.user_id, NULL, 'wishlist'))
        END,
        viewer_id, i.user_id)
  );
$$;

CREATE OR REPLACE FUNCTION sharing_private.owned_item_is_visible(p_item_id uuid, p_viewer_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.items i
    WHERE i.id = p_item_id AND NOT i.is_wishlist
      AND CASE WHEN i.box_id IS NULL THEN
        sharing_private.audience_allows(
          sharing_private.container_audience(i.user_id, NULL, 'collection'), p_viewer_id, i.user_id)
      ELSE
        EXISTS (
          SELECT 1 FROM public.boxes b
          WHERE b.id = i.box_id AND b.user_id = i.user_id
            AND sharing_private.collection_box_is_visible(b.id, p_viewer_id)
        )
      END
  );
$$;

CREATE OR REPLACE FUNCTION sharing_private.guard_box_tree() RETURNS trigger
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
    NEW.collection_visibility := sharing_private.container_audience(NEW.user_id, NEW.parent_box_id, 'collection');
    NEW.wishlist_visibility := sharing_private.container_audience(NEW.user_id, NEW.parent_box_id, 'wishlist');
    NEW.share_financials := sharing_private.container_share_financials(NEW.user_id, NEW.parent_box_id);
  ELSIF NEW.parent_box_id IS DISTINCT FROM OLD.parent_box_id THEN
    NEW.collection_visibility := least(NEW.collection_visibility,
      sharing_private.container_audience(NEW.user_id, NEW.parent_box_id, 'collection'));
    NEW.wishlist_visibility := least(NEW.wishlist_visibility,
      sharing_private.container_audience(NEW.user_id, NEW.parent_box_id, 'wishlist'));
  ELSE
    IF NEW.collection_visibility > sharing_private.container_audience(NEW.user_id, NEW.parent_box_id, 'collection')
       OR NEW.wishlist_visibility > sharing_private.container_audience(NEW.user_id, NEW.parent_box_id, 'wishlist') THEN
      RAISE EXCEPTION 'privacy_conflict' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF (NEW.collection_visibility <> 'private' OR NEW.wishlist_visibility <> 'private') AND
     NOT sharing_private.owner_is_publishable(NEW.user_id) THEN
    RAISE EXCEPTION 'publication unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION sharing_private.clamp_narrowed_subtrees() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF current_setting('sharing_private.cascade_clamp', true) = 'on' THEN RETURN NULL; END IF;
  IF NEW.collection_visibility < OLD.collection_visibility
     OR NEW.wishlist_visibility < OLD.wishlist_visibility THEN
    PERFORM set_config('sharing_private.cascade_clamp', 'on', true);
    UPDATE public.boxes descendant SET
      collection_visibility = least(descendant.collection_visibility, NEW.collection_visibility),
      wishlist_visibility = least(descendant.wishlist_visibility, NEW.wishlist_visibility)
    WHERE descendant.user_id = NEW.user_id
      AND descendant.id IN (
        WITH RECURSIVE subtree(id) AS (
          SELECT NEW.id
          UNION ALL
          SELECT b.id FROM public.boxes b JOIN subtree s ON b.parent_box_id = s.id
            WHERE b.user_id = NEW.user_id
        )
        SELECT id FROM subtree WHERE id <> NEW.id
      )
      AND (descendant.collection_visibility > NEW.collection_visibility
        OR descendant.wishlist_visibility > NEW.wishlist_visibility);
    PERFORM set_config('sharing_private.cascade_clamp', '', true);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER sharing_boxes_clamp AFTER UPDATE ON public.boxes
  FOR EACH ROW EXECUTE FUNCTION sharing_private.clamp_narrowed_subtrees();

CREATE FUNCTION sharing_private.clamp_top_level_on_root_narrow() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM sharing_private.lock_accounts(NEW.user_id);
  UPDATE public.boxes b SET
    collection_visibility = least(b.collection_visibility,
      sharing_private.container_audience(NEW.user_id, NULL, 'collection')),
    wishlist_visibility = least(b.wishlist_visibility,
      sharing_private.container_audience(NEW.user_id, NULL, 'wishlist'))
  WHERE b.user_id = NEW.user_id AND b.parent_box_id IS NULL
    AND (b.collection_visibility > sharing_private.container_audience(NEW.user_id, NULL, 'collection')
      OR b.wishlist_visibility > sharing_private.container_audience(NEW.user_id, NULL, 'wishlist'));
  RETURN NEW;
END $$;

CREATE TRIGGER sharing_settings_root_ceiling AFTER UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION sharing_private.clamp_top_level_on_root_narrow();

REVOKE ALL ON FUNCTION sharing_private.clamp_narrowed_subtrees(),
  sharing_private.clamp_top_level_on_root_narrow() FROM PUBLIC, anon, authenticated, service_role;

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
    RAISE EXCEPTION 'privacy_conflict' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.sharing_preview_box(
  p_actor_id uuid, p_box_id uuid,
  p_collection_visibility public.sharing_audience DEFAULT NULL,
  p_share_financials boolean DEFAULT NULL,
  p_wishlist_visibility public.sharing_audience DEFAULT NULL,
  p_apply_descendants boolean DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE box public.boxes%ROWTYPE; revision bigint; descendant_count bigint; has_cycle boolean;
  affected_count bigint; payload jsonb;
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
  payload := jsonb_build_object('revision',revision::text,'descendantCount',descendant_count,
    'settings',jsonb_build_object('collectionVisibility',box.collection_visibility,'shareFinancials',box.share_financials,'wishlistVisibility',box.wishlist_visibility));
  IF p_collection_visibility IS NOT NULL AND p_share_financials IS NOT NULL
     AND p_wishlist_visibility IS NOT NULL AND p_apply_descendants IS NOT NULL THEN
    WITH RECURSIVE subtree(id) AS (
      SELECT box.id UNION ALL
      SELECT b.id FROM public.boxes b JOIN subtree s ON b.parent_box_id = s.id WHERE b.user_id = p_actor_id
    )
    SELECT count(*) INTO affected_count
    FROM public.boxes b
    WHERE b.user_id = p_actor_id AND b.id IN (SELECT id FROM subtree)
      AND (
        (b.id = p_box_id AND (b.collection_visibility IS DISTINCT FROM p_collection_visibility
          OR b.wishlist_visibility IS DISTINCT FROM p_wishlist_visibility
          OR b.share_financials IS DISTINCT FROM p_share_financials))
        OR (b.id <> p_box_id AND (
          b.collection_visibility > p_collection_visibility
          OR b.wishlist_visibility > p_wishlist_visibility
          OR (p_apply_descendants AND b.share_financials IS DISTINCT FROM p_share_financials)
        ))
      );
    payload := payload || jsonb_build_object('affectedCount', coalesce(affected_count, 0));
  END IF;
  RETURN jsonb_build_object('ok',true,'data',payload);
END $$;

CREATE OR REPLACE FUNCTION public.sharing_update_box(
  p_actor_id uuid,p_box_id uuid,p_collection_visibility public.sharing_audience,p_share_financials boolean,
  p_wishlist_visibility public.sharing_audience,p_apply_descendants boolean,p_expected_revision bigint,p_expected_descendant_count bigint
) RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE preview jsonb; revision bigint;
BEGIN
  IF p_collection_visibility IS NULL OR p_share_financials IS NULL OR p_wishlist_visibility IS NULL OR p_apply_descendants IS NULL OR
     p_expected_revision IS NULL OR p_expected_revision < 0 OR p_expected_descendant_count IS NULL OR p_expected_descendant_count < 0 THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  preview := public.sharing_preview_box(p_actor_id,p_box_id,NULL,NULL,NULL,NULL);
  IF NOT (preview->>'ok')::boolean THEN RETURN preview; END IF;
  IF preview->'data'->>'revision' <> p_expected_revision::text OR
     (preview->'data'->>'descendantCount')::bigint <> p_expected_descendant_count THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','revision_conflict','status',409));
  END IF;
  BEGIN
    UPDATE public.boxes SET collection_visibility = p_collection_visibility,
      share_financials = p_share_financials, wishlist_visibility = p_wishlist_visibility
      WHERE id = p_box_id AND user_id = p_actor_id;
    IF p_apply_descendants THEN
      WITH RECURSIVE subtree(id) AS (
        SELECT p_box_id UNION ALL
        SELECT b.id FROM public.boxes b JOIN subtree s ON b.parent_box_id = s.id WHERE b.user_id = p_actor_id
      )
      UPDATE public.boxes b SET share_financials = p_share_financials
        WHERE b.user_id = p_actor_id AND b.id IN (SELECT id FROM subtree WHERE id <> p_box_id);
    END IF;
  EXCEPTION
    WHEN serialization_failure THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','revision_conflict','status',409));
    WHEN invalid_parameter_value THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
    WHEN raise_exception THEN
      IF SQLERRM = 'privacy_conflict' THEN
        RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','privacy_conflict','status',409));
      END IF;
      RAISE;
  END;
  SELECT sharing_revision INTO revision FROM public.users WHERE id = p_actor_id;
  IF revision::text = preview->'data'->>'revision' THEN
    UPDATE public.users SET sharing_revision = sharing_revision + 1 WHERE id = p_actor_id RETURNING sharing_revision INTO revision;
  END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('revision',revision::text));
EXCEPTION
  WHEN serialization_failure THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','revision_conflict','status',409));
  WHEN invalid_parameter_value THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  WHEN raise_exception THEN
    IF SQLERRM = 'privacy_conflict' THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','privacy_conflict','status',409));
    END IF;
    RAISE;
END $$;

REVOKE ALL ON FUNCTION public.sharing_preview_box(uuid,uuid,public.sharing_audience,boolean,public.sharing_audience,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sharing_preview_box(uuid,uuid,public.sharing_audience,boolean,public.sharing_audience,boolean)
  TO service_role;
DROP FUNCTION public.sharing_preview_box(uuid, uuid);

CREATE OR REPLACE FUNCTION public.sharing_read_page(
  p_owner_id uuid, p_viewer_id uuid, p_surface text,
  p_parent_id uuid DEFAULT NULL, p_after_key jsonb DEFAULT NULL,
  p_expected_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE context jsonb; rows jsonb; root_share boolean;
BEGIN
  context := public.sharing_read_context(p_owner_id,p_viewer_id);
  IF NOT (context->>'ok')::boolean THEN RETURN context; END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision::text <> context->'data'->>'revision' THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','cursor_reset','status',409));
  END IF;
  IF p_surface IS NULL OR p_surface NOT IN ('boxes','items','wishlist') THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  IF p_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.boxes b WHERE b.id = p_parent_id AND b.user_id = p_owner_id
      AND sharing_private.collection_box_is_visible(b.id,p_viewer_id)) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  IF p_surface = 'items' AND p_parent_id IS NULL AND NOT sharing_private.audience_allows(
      sharing_private.container_audience(p_owner_id, NULL, 'collection'), p_viewer_id, p_owner_id) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  IF p_after_key IS NOT NULL THEN
    IF jsonb_typeof(p_after_key) <> 'object' OR NOT (p_after_key ? 'id' AND p_after_key ? 'value') OR
      jsonb_typeof(p_after_key->'id') IS DISTINCT FROM 'string' OR
      jsonb_typeof(p_after_key->'value') IS DISTINCT FROM (CASE WHEN p_surface = 'wishlist' THEN 'string' ELSE 'number' END) THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
    END IF;
    PERFORM (p_after_key->>'id')::uuid;
    IF p_surface = 'wishlist' THEN PERFORM (p_after_key->>'value')::timestamptz;
    ELSE PERFORM (p_after_key->>'value')::integer; END IF;
  END IF;

  IF p_surface = 'boxes' THEN
    SELECT coalesce(jsonb_agg(q.row ORDER BY q.position,q.id),'[]'::jsonb) INTO rows FROM (
      SELECT b.id,coalesce(b.position,0) AS position,jsonb_build_object(
        'key',jsonb_build_object('value',coalesce(b.position,0),'id',b.id),
        'item',jsonb_build_object('id',b.id,'name',b.name,'description',b.description,
          'displayParentId',b.parent_box_id,
          'hasVisibleChildren',EXISTS (SELECT 1 FROM public.boxes child WHERE child.user_id = p_owner_id AND child.parent_box_id = b.id
            AND sharing_private.collection_box_is_visible(child.id,p_viewer_id)))) AS row
      FROM public.boxes b
      WHERE b.user_id = p_owner_id AND sharing_private.collection_box_is_visible(b.id,p_viewer_id)
        AND ((p_parent_id IS NOT NULL AND b.parent_box_id = p_parent_id) OR
          (p_parent_id IS NULL AND b.parent_box_id IS NULL))
        AND (p_after_key IS NULL OR (coalesce(b.position,0),b.id) > ((p_after_key->>'value')::integer,(p_after_key->>'id')::uuid))
      ORDER BY coalesce(b.position,0),b.id LIMIT 21
    ) q;
  ELSIF p_surface = 'items' AND p_parent_id IS NULL THEN
    root_share := sharing_private.container_share_financials(p_owner_id, NULL);
    SELECT coalesce(jsonb_agg(q.row ORDER BY q.position,q.id),'[]'::jsonb) INTO rows FROM (
      SELECT i.id,coalesce(i.position,0) AS position,jsonb_build_object(
        'key',jsonb_build_object('value',coalesce(i.position,0),'id',i.id),
        'item',jsonb_build_object('id',i.id,'name',i.name,'description',i.description,'thumbnail',NULL,'thumbnailReferenceId',(SELECT p.id FROM public.photos p WHERE p.item_id=i.id ORDER BY p.is_thumbnail DESC,p.uploaded_at,p.id LIMIT 1),
          'currentValue',CASE WHEN root_share THEN i.current_value ELSE NULL END,
          'acquisitionPrice',CASE WHEN root_share THEN i.acquisition_price ELSE NULL END,
          'acquisitionDate',CASE WHEN root_share THEN i.acquisition_date ELSE NULL END)) AS row
      FROM public.items i
      WHERE i.user_id = p_owner_id AND i.box_id IS NULL AND NOT i.is_wishlist
        AND (p_after_key IS NULL OR (coalesce(i.position,0),i.id) > ((p_after_key->>'value')::integer,(p_after_key->>'id')::uuid))
      ORDER BY coalesce(i.position,0),i.id LIMIT 21
    ) q;
  ELSIF p_surface = 'items' THEN
    SELECT coalesce(jsonb_agg(q.row ORDER BY q.position,q.id),'[]'::jsonb) INTO rows FROM (
      SELECT i.id,coalesce(i.position,0) AS position,jsonb_build_object(
        'key',jsonb_build_object('value',coalesce(i.position,0),'id',i.id),
        'item',jsonb_build_object('id',i.id,'name',i.name,'description',i.description,'thumbnail',NULL,'thumbnailReferenceId',(SELECT p.id FROM public.photos p WHERE p.item_id=i.id ORDER BY p.is_thumbnail DESC,p.uploaded_at,p.id LIMIT 1),
          'currentValue',CASE WHEN b.share_financials THEN i.current_value ELSE NULL END,
          'acquisitionPrice',CASE WHEN b.share_financials THEN i.acquisition_price ELSE NULL END,
          'acquisitionDate',CASE WHEN b.share_financials THEN i.acquisition_date ELSE NULL END)) AS row
      FROM public.items i JOIN public.boxes b ON b.id = i.box_id AND b.user_id = i.user_id
      WHERE i.user_id = p_owner_id AND i.box_id = p_parent_id AND NOT i.is_wishlist
        AND (p_after_key IS NULL OR (coalesce(i.position,0),i.id) > ((p_after_key->>'value')::integer,(p_after_key->>'id')::uuid))
      ORDER BY coalesce(i.position,0),i.id LIMIT 21
    ) q;
  ELSE
    SELECT coalesce(jsonb_agg(q.row ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb) INTO rows FROM (
      SELECT i.id,i.created_at,jsonb_build_object(
        'key',jsonb_build_object('value',i.created_at,'id',i.id),
        'item',jsonb_build_object('id',i.id,'name',i.name,'description',i.description,'thumbnail',NULL,'thumbnailReferenceId',(SELECT p.id FROM public.photos p WHERE p.item_id=i.id ORDER BY p.is_thumbnail DESC,p.uploaded_at,p.id LIMIT 1),
          'expectedPrice',i.expected_price,
          'visibleTarget',CASE WHEN b.id IS NOT NULL AND sharing_private.collection_box_is_visible(b.id,p_viewer_id)
            THEN jsonb_build_object('id',b.id,'name',b.name) ELSE NULL END)) AS row
      FROM public.items i LEFT JOIN public.boxes b ON b.id = i.wishlist_target_box_id AND b.user_id = i.user_id
      WHERE i.user_id = p_owner_id AND sharing_private.wishlist_item_is_visible(i.id,p_viewer_id)
        AND (p_parent_id IS NULL OR i.wishlist_target_box_id = p_parent_id)
        AND (p_after_key IS NULL OR (i.created_at,i.id) < ((p_after_key->>'value')::timestamptz,(p_after_key->>'id')::uuid))
      ORDER BY i.created_at DESC,i.id DESC LIMIT 21
    ) q;
  END IF;
  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('rows',rows,
    'revision',context->'data'->>'revision','viewerCategory',context->'data'->>'viewerCategory'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
  RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
END $$;

CREATE OR REPLACE FUNCTION sharing_private.visible_connected_box_ids(p_owner_id uuid, p_viewer_id uuid, p_box_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH RECURSIVE roots AS (
    SELECT b.id
    FROM public.boxes b
    WHERE b.user_id = p_owner_id
      AND sharing_private.collection_box_is_visible(b.id, p_viewer_id)
      AND (
        (p_box_id IS NOT NULL AND b.id = p_box_id)
        OR (p_box_id IS NULL AND b.parent_box_id IS NULL)
      )
  ),
  tree AS (
    SELECT id FROM roots
    UNION ALL
    SELECT child.id
    FROM public.boxes child
    JOIN tree t ON child.parent_box_id = t.id AND child.user_id = p_owner_id
    WHERE sharing_private.collection_box_is_visible(child.id, p_viewer_id)
  ) CYCLE id SET cyclic USING path
  SELECT id FROM tree WHERE NOT cyclic
$$;

CREATE OR REPLACE FUNCTION public.sharing_read_stats(
  p_owner_id uuid, p_viewer_id uuid, p_box_id uuid DEFAULT NULL, p_from date DEFAULT NULL, p_to date DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE
  context jsonb;
  box_count integer;
  start_d date;
  end_d date;
  bucket text;
  payload jsonb;
BEGIN
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  context := public.sharing_read_context(p_owner_id, p_viewer_id);
  IF NOT (context->>'ok')::boolean THEN RETURN context; END IF;
  IF p_box_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.boxes b WHERE b.id = p_box_id AND b.user_id = p_owner_id
      AND sharing_private.collection_box_is_visible(b.id, p_viewer_id)
  ) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  SELECT count(*) INTO box_count FROM sharing_private.visible_connected_box_ids(p_owner_id, p_viewer_id, p_box_id);
  IF box_count > 8000 THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','temporarily_unavailable','status',503));
  END IF;

  WITH permitted AS (
    SELECT i.id, i.current_value, i.acquisition_price, i.acquisition_date
    FROM public.items i
    LEFT JOIN public.boxes b ON b.id = i.box_id AND b.user_id = i.user_id
    WHERE i.user_id = p_owner_id AND NOT i.is_wishlist
      AND (
        (i.box_id IS NOT NULL AND b.share_financials
          AND i.box_id IN (SELECT sharing_private.visible_connected_box_ids(p_owner_id, p_viewer_id, p_box_id)))
        OR (p_box_id IS NULL AND i.box_id IS NULL
          AND sharing_private.container_share_financials(p_owner_id, NULL)
          AND sharing_private.audience_allows(
            sharing_private.container_audience(p_owner_id, NULL, 'collection'), p_viewer_id, p_owner_id))
      )
  )
  SELECT coalesce(p_from, least(min(acquisition_date), (
    SELECT min((vh.recorded_at AT TIME ZONE 'utc')::date) FROM public.value_history vh
    JOIN permitted p ON p.id = vh.item_id
  ), CURRENT_DATE), CURRENT_DATE), coalesce(p_to, CURRENT_DATE)
  INTO start_d, end_d FROM permitted;
  IF start_d IS NULL THEN start_d := CURRENT_DATE; END IF;
  IF end_d IS NULL THEN end_d := CURRENT_DATE; END IF;
  IF end_d < start_d THEN end_d := start_d; END IF;

  IF end_d - start_d + 1 <= 366 THEN bucket := 'day';
  ELSIF ((extract(year FROM end_d)::integer - extract(year FROM start_d)::integer) * 12
      + extract(month FROM end_d)::integer - extract(month FROM start_d)::integer + 1) <= 366 THEN bucket := 'month';
  ELSE
    bucket := 'year';
    IF extract(year FROM end_d)::integer - extract(year FROM start_d)::integer + 1 > 366 THEN
      start_d := make_date(extract(year FROM end_d)::integer - 365, 1, 1);
    END IF;
  END IF;

  WITH permitted AS (
    SELECT i.id, i.current_value, i.acquisition_price, i.acquisition_date
    FROM public.items i
    LEFT JOIN public.boxes b ON b.id = i.box_id AND b.user_id = i.user_id
    WHERE i.user_id = p_owner_id AND NOT i.is_wishlist
      AND (
        (i.box_id IS NOT NULL AND b.share_financials
          AND i.box_id IN (SELECT sharing_private.visible_connected_box_ids(p_owner_id, p_viewer_id, p_box_id)))
        OR (p_box_id IS NULL AND i.box_id IS NULL
          AND sharing_private.container_share_financials(p_owner_id, NULL)
          AND sharing_private.audience_allows(
            sharing_private.container_audience(p_owner_id, NULL, 'collection'), p_viewer_id, p_owner_id))
      )
  ),
  buckets AS (SELECT * FROM sharing_private.stats_buckets(start_d, end_d, bucket)),
  values AS (
    SELECT d.bucket_date, coalesce(sum(
      coalesce((
        SELECT vh.value FROM public.value_history vh
        WHERE vh.item_id = p.id AND (vh.recorded_at AT TIME ZONE 'utc')::date <= d.as_of
        ORDER BY vh.recorded_at DESC, vh.id DESC LIMIT 1
      ), CASE WHEN d.as_of >= CURRENT_DATE THEN coalesce(p.current_value, 0) ELSE 0 END)
    ), 0) AS value
    FROM buckets d LEFT JOIN permitted p ON true
    GROUP BY d.bucket_date
  ),
  acquisitions AS (
    SELECT d.bucket_date, coalesce(sum(p.acquisition_price) FILTER (
      WHERE p.acquisition_date IS NOT NULL AND p.acquisition_date <= d.as_of), 0) AS total
    FROM buckets d LEFT JOIN permitted p ON true
    GROUP BY d.bucket_date
  )
  SELECT jsonb_build_object(
    'currentValue', coalesce((SELECT sum(current_value) FROM permitted), 0),
    'totalAcquisition', coalesce((SELECT sum(acquisition_price) FROM permitted), 0),
    'bucket', bucket,
    'valueHistory', coalesce((SELECT jsonb_agg(jsonb_build_object('date', bucket_date, 'value', value) ORDER BY bucket_date) FROM values), '[]'::jsonb),
    'acquisitionHistory', coalesce((SELECT jsonb_agg(jsonb_build_object('date', bucket_date, 'cumulativeAcquisition', total) ORDER BY bucket_date) FROM acquisitions), '[]'::jsonb),
    'revision', context->'data'->>'revision',
    'viewerCategory', context->'data'->>'viewerCategory'
  ) INTO payload;

  RETURN jsonb_build_object('ok', true, 'data', payload);
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation THEN
  RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
END $$;

DROP FUNCTION public.sharing_read_item_detail(uuid,uuid,uuid,text,jsonb,jsonb,bigint);
CREATE FUNCTION public.sharing_read_item_detail(
 p_owner_id uuid, p_viewer_id uuid, p_item_id uuid, p_surface text,
 p_photos_after_key jsonb DEFAULT NULL, p_expected_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE context jsonb; item public.items%ROWTYPE; box public.boxes%ROWTYPE;
 projection jsonb; photos jsonb; share boolean;
BEGIN
 context := public.sharing_read_context(p_owner_id,p_viewer_id);
 IF NOT (context->>'ok')::boolean THEN RETURN context; END IF;
 IF p_expected_revision IS NOT NULL AND p_expected_revision::text <> context->'data'->>'revision' THEN
  RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','cursor_reset','status',409));
 END IF;
 IF p_surface IS NULL OR p_surface NOT IN ('items','wishlist') OR p_item_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
 END IF;
 SELECT * INTO item FROM public.items i WHERE i.id=p_item_id AND i.user_id=p_owner_id
  AND CASE WHEN p_surface='wishlist' THEN i.is_wishlist AND sharing_private.wishlist_item_is_visible(i.id,p_viewer_id)
      ELSE NOT i.is_wishlist AND sharing_private.owned_item_is_visible(i.id,p_viewer_id) END;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
 END IF;
 IF p_photos_after_key IS NOT NULL THEN
  IF jsonb_typeof(p_photos_after_key) <> 'object'
    OR jsonb_typeof(p_photos_after_key->'id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_photos_after_key->'value') IS DISTINCT FROM 'string' THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  PERFORM (p_photos_after_key->>'id')::uuid;
  PERFORM (p_photos_after_key->>'value')::timestamptz;
 END IF;
 SELECT * INTO box FROM public.boxes b WHERE b.user_id=p_owner_id
  AND b.id=CASE WHEN item.is_wishlist THEN item.wishlist_target_box_id ELSE item.box_id END;
 share := CASE WHEN item.is_wishlist THEN false
   WHEN item.box_id IS NULL THEN sharing_private.container_share_financials(p_owner_id, NULL)
   ELSE coalesce(box.share_financials, false) END;
 projection := jsonb_build_object('id',item.id,'name',item.name,'description',item.description,'thumbnail',NULL,
  'thumbnailReferenceId',(SELECT p.id FROM public.photos p WHERE p.item_id=item.id ORDER BY p.is_thumbnail DESC,p.uploaded_at,p.id LIMIT 1));
 IF p_surface='wishlist' THEN
  projection := projection || jsonb_build_object('expectedPrice',item.expected_price,
   'visibleTarget',CASE WHEN box.id IS NOT NULL AND sharing_private.collection_box_is_visible(box.id,p_viewer_id)
    THEN jsonb_build_object('id',box.id,'name',box.name) ELSE NULL END);
 ELSE
  projection := projection || jsonb_build_object(
   'currentValue',CASE WHEN share THEN item.current_value ELSE NULL END,
   'acquisitionPrice',CASE WHEN share THEN item.acquisition_price ELSE NULL END,
   'acquisitionDate',CASE WHEN share THEN item.acquisition_date ELSE NULL END);
 END IF;
 SELECT coalesce(jsonb_agg(q.row ORDER BY q.uploaded_at,q.id),'[]'::jsonb) INTO photos FROM (
  SELECT p.id,p.uploaded_at,jsonb_build_object('referenceId',p.id,'key',jsonb_build_object('id',p.id,'value',p.uploaded_at)) AS row
  FROM public.photos p WHERE p.item_id=item.id
   AND (p_photos_after_key IS NULL OR (p.uploaded_at,p.id)>((p_photos_after_key->>'value')::timestamptz,(p_photos_after_key->>'id')::uuid))
  ORDER BY p.uploaded_at,p.id LIMIT 21
 ) q;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('item',projection,'photos',photos,
  'revision',context->'data'->>'revision','viewerCategory',context->'data'->>'viewerCategory'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
END $$;
REVOKE ALL ON FUNCTION public.sharing_read_item_detail(uuid,uuid,uuid,text,jsonb,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sharing_read_item_detail(uuid,uuid,uuid,text,jsonb,bigint) TO service_role;

-- Backfill, then prove the invariant. Clone rows are already private; run it anyway.
DO $$
DECLARE changed integer;
BEGIN
  LOOP
    UPDATE public.boxes b SET
      collection_visibility = least(b.collection_visibility,
        sharing_private.container_audience(b.user_id, b.parent_box_id, 'collection')),
      wishlist_visibility = least(b.wishlist_visibility,
        sharing_private.container_audience(b.user_id, b.parent_box_id, 'wishlist'))
    WHERE b.collection_visibility > sharing_private.container_audience(b.user_id, b.parent_box_id, 'collection')
       OR b.wishlist_visibility > sharing_private.container_audience(b.user_id, b.parent_box_id, 'wishlist');
    GET DIAGNOSTICS changed = ROW_COUNT;
    EXIT WHEN changed = 0;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM public.boxes b
    WHERE b.collection_visibility > sharing_private.container_audience(b.user_id, b.parent_box_id, 'collection')
       OR b.wishlist_visibility > sharing_private.container_audience(b.user_id, b.parent_box_id, 'wishlist')
  ) THEN
    RAISE EXCEPTION 'audience ceiling backfill left a wider child';
  END IF;
END $$;

COMMIT;

BEGIN;
CREATE OR REPLACE FUNCTION public.sharing_read_page(
  p_owner_id uuid, p_viewer_id uuid, p_surface text,
  p_parent_id uuid DEFAULT NULL, p_after_key jsonb DEFAULT NULL,
  p_expected_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE context jsonb; rows jsonb;
BEGIN
  context := public.sharing_read_context(p_owner_id,p_viewer_id);
  IF NOT (context->>'ok')::boolean THEN RETURN context; END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision::text <> context->'data'->>'revision' THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','cursor_reset','status',409));
  END IF;
  IF p_surface IS NULL OR p_surface NOT IN ('boxes','items','wishlist') OR
    (p_surface = 'items' AND p_parent_id IS NULL) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  IF p_parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.boxes b WHERE b.id = p_parent_id AND b.user_id = p_owner_id
      AND sharing_private.collection_box_is_visible(b.id,p_viewer_id)) THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','not_found','status',404));
  END IF;
  IF p_after_key IS NOT NULL THEN
    IF jsonb_typeof(p_after_key) <> 'object' OR NOT (p_after_key ? 'id' AND p_after_key ? 'value') OR
      jsonb_typeof(p_after_key->'id') IS DISTINCT FROM 'string' OR
      jsonb_typeof(p_after_key->'value') IS DISTINCT FROM (CASE WHEN p_surface = 'wishlist' THEN 'string' ELSE 'number' END) THEN
      RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
    END IF;
    -- Validate even when the requested page contains no source rows.
    PERFORM (p_after_key->>'id')::uuid;
    IF p_surface = 'wishlist' THEN PERFORM (p_after_key->>'value')::timestamptz;
    ELSE PERFORM (p_after_key->>'value')::integer; END IF;
  END IF;

  IF p_surface = 'boxes' THEN
    SELECT coalesce(jsonb_agg(q.row ORDER BY q.position,q.id),'[]'::jsonb) INTO rows FROM (
      SELECT b.id,coalesce(b.position,0) AS position,jsonb_build_object(
        'key',jsonb_build_object('value',coalesce(b.position,0),'id',b.id),
        'item',jsonb_build_object('id',b.id,'name',b.name,'description',b.description,
          'displayParentId',CASE WHEN parent.id IS NOT NULL AND sharing_private.collection_box_is_visible(parent.id,p_viewer_id) THEN parent.id ELSE NULL END,
          'hasVisibleChildren',EXISTS (SELECT 1 FROM public.boxes child WHERE child.user_id = p_owner_id AND child.parent_box_id = b.id
            AND sharing_private.collection_box_is_visible(child.id,p_viewer_id)))) AS row
      FROM public.boxes b
      LEFT JOIN public.boxes parent ON parent.id = b.parent_box_id AND parent.user_id = p_owner_id
      WHERE b.user_id = p_owner_id AND sharing_private.collection_box_is_visible(b.id,p_viewer_id)
        AND ((p_parent_id IS NOT NULL AND b.parent_box_id = p_parent_id) OR
          (p_parent_id IS NULL AND (parent.id IS NULL OR NOT sharing_private.collection_box_is_visible(parent.id,p_viewer_id))))
        AND (p_after_key IS NULL OR (coalesce(b.position,0),b.id) > ((p_after_key->>'value')::integer,(p_after_key->>'id')::uuid))
      ORDER BY coalesce(b.position,0),b.id LIMIT 21
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

CREATE OR REPLACE FUNCTION public.sharing_read_item_detail(
 p_owner_id uuid, p_viewer_id uuid, p_item_id uuid, p_surface text,
 p_photos_after_key jsonb DEFAULT NULL, p_tags_after_key jsonb DEFAULT NULL,
 p_expected_revision bigint DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE context jsonb; item public.items%ROWTYPE; box public.boxes%ROWTYPE;
 projection jsonb; photos jsonb; tags jsonb;
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
 IF p_tags_after_key IS NOT NULL THEN
  IF jsonb_typeof(p_tags_after_key) <> 'object'
    OR jsonb_typeof(p_tags_after_key->'id') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_tags_after_key->'value') IS DISTINCT FROM 'null' THEN
    RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
  END IF;
  PERFORM (p_tags_after_key->>'id')::uuid;
 END IF;
 SELECT * INTO box FROM public.boxes b WHERE b.user_id=p_owner_id
  AND b.id=CASE WHEN item.is_wishlist THEN item.wishlist_target_box_id ELSE item.box_id END;
 projection := jsonb_build_object('id',item.id,'name',item.name,'description',item.description,'thumbnail',NULL,
  'thumbnailReferenceId',(SELECT p.id FROM public.photos p WHERE p.item_id=item.id ORDER BY p.is_thumbnail DESC,p.uploaded_at,p.id LIMIT 1));
 IF p_surface='wishlist' THEN
  projection := projection || jsonb_build_object('expectedPrice',item.expected_price,
   'visibleTarget',CASE WHEN box.id IS NOT NULL AND sharing_private.collection_box_is_visible(box.id,p_viewer_id)
    THEN jsonb_build_object('id',box.id,'name',box.name) ELSE NULL END);
 ELSE
  projection := projection || jsonb_build_object(
   'currentValue',CASE WHEN box.share_financials THEN item.current_value ELSE NULL END,
   'acquisitionPrice',CASE WHEN box.share_financials THEN item.acquisition_price ELSE NULL END,
   'acquisitionDate',CASE WHEN box.share_financials THEN item.acquisition_date ELSE NULL END);
 END IF;
 SELECT coalesce(jsonb_agg(q.row ORDER BY q.uploaded_at,q.id),'[]'::jsonb) INTO photos FROM (
  SELECT p.id,p.uploaded_at,jsonb_build_object('referenceId',p.id,'key',jsonb_build_object('id',p.id,'value',p.uploaded_at)) AS row
  FROM public.photos p WHERE p.item_id=item.id
   AND (p_photos_after_key IS NULL OR (p.uploaded_at,p.id)>((p_photos_after_key->>'value')::timestamptz,(p_photos_after_key->>'id')::uuid))
  ORDER BY p.uploaded_at,p.id LIMIT 21
 ) q;
 SELECT coalesce(jsonb_agg(q.row ORDER BY q.id),'[]'::jsonb) INTO tags FROM (
  SELECT t.id,jsonb_build_object('name',t.name,'color',t.color,'key',jsonb_build_object('id',t.id,'value',NULL)) AS row
  FROM public.item_tags it JOIN public.tags t ON t.id=it.tag_id AND t.user_id=p_owner_id
  WHERE it.item_id=item.id AND (p_tags_after_key IS NULL OR t.id>(p_tags_after_key->>'id')::uuid)
  ORDER BY t.id LIMIT 21
 ) q;
 RETURN jsonb_build_object('ok',true,'data',jsonb_build_object('item',projection,'photos',photos,'tags',tags,
  'revision',context->'data'->>'revision','viewerCategory',context->'data'->>'viewerCategory'));
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
 RETURN jsonb_build_object('ok',false,'error',jsonb_build_object('code','invalid_input','status',400));
END $$;
REVOKE ALL ON FUNCTION public.sharing_read_item_detail(uuid,uuid,uuid,text,jsonb,jsonb,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sharing_read_item_detail(uuid,uuid,uuid,text,jsonb,jsonb,bigint) TO service_role;
COMMIT;

BEGIN;
CREATE OR REPLACE FUNCTION sharing_private.visible_connected_box_ids(p_owner_id uuid, p_viewer_id uuid, p_box_id uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH RECURSIVE roots AS (
    SELECT b.id
    FROM public.boxes b
    LEFT JOIN public.boxes parent ON parent.id = b.parent_box_id AND parent.user_id = p_owner_id
    WHERE b.user_id = p_owner_id
      AND sharing_private.collection_box_is_visible(b.id, p_viewer_id)
      AND (
        (p_box_id IS NOT NULL AND b.id = p_box_id)
        OR (p_box_id IS NULL AND (parent.id IS NULL OR NOT sharing_private.collection_box_is_visible(parent.id, p_viewer_id)))
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

CREATE OR REPLACE FUNCTION sharing_private.stats_buckets(p_start date, p_end date, p_bucket text)
RETURNS TABLE(bucket_date date, as_of date) LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT d::date,
    CASE p_bucket
      WHEN 'day' THEN d::date
      WHEN 'month' THEN least((d::date + interval '1 month' - interval '1 day')::date, p_end)
      ELSE least((d::date + interval '1 year' - interval '1 day')::date, p_end)
    END
  FROM generate_series(
    CASE p_bucket
      WHEN 'day' THEN p_start
      WHEN 'month' THEN date_trunc('month', p_start::timestamp)::date
      ELSE date_trunc('year', p_start::timestamp)::date
    END::timestamp,
    CASE p_bucket
      WHEN 'day' THEN p_end
      WHEN 'month' THEN date_trunc('month', p_end::timestamp)::date
      ELSE date_trunc('year', p_end::timestamp)::date
    END::timestamp,
    CASE p_bucket WHEN 'day' THEN interval '1 day' WHEN 'month' THEN interval '1 month' ELSE interval '1 year' END
  ) d
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
    JOIN public.boxes b ON b.id = i.box_id AND b.user_id = i.user_id AND b.share_financials
    WHERE i.user_id = p_owner_id AND NOT i.is_wishlist
      AND i.box_id IN (SELECT sharing_private.visible_connected_box_ids(p_owner_id, p_viewer_id, p_box_id))
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
    JOIN public.boxes b ON b.id = i.box_id AND b.user_id = i.user_id AND b.share_financials
    WHERE i.user_id = p_owner_id AND NOT i.is_wishlist
      AND i.box_id IN (SELECT sharing_private.visible_connected_box_ids(p_owner_id, p_viewer_id, p_box_id))
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

REVOKE ALL ON FUNCTION sharing_private.visible_connected_box_ids(uuid,uuid,uuid),
  sharing_private.stats_buckets(date,date,text),
  public.sharing_read_stats(uuid,uuid,uuid,date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sharing_private.visible_connected_box_ids(uuid,uuid,uuid),
  sharing_private.stats_buckets(date,date,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sharing_read_stats(uuid,uuid,uuid,date,date) TO service_role;
COMMIT;

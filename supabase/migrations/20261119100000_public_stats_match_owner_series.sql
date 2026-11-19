-- Public stats use the owner's definition of "value over time".
--
-- buildBoxStats (lib/stats/box-stats-series.ts) values an item on a day at its
-- latest value_history record on or before that UTC day. With no such record,
-- it uses the current value on today and later, and 0 earlier. An item with no
-- value history at all is the exception: it counts at its current value on
-- every day. sharing_read_stats counted that item as 0 before today, so a
-- shared box charted lower on a public profile than for its owner. It also
-- read "today" from CURRENT_DATE, which follows the session time zone; the
-- owner series uses the UTC day.
--
-- Only the valueHistory figures change. Buckets, totals, the acquisition
-- series, visibility and errors are as before.
BEGIN;

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
  -- statsToday(): the UTC calendar day.
  today date := (now() AT TIME ZONE 'utc')::date;
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
  ), today), today), coalesce(p_to, today)
  INTO start_d, end_d FROM permitted;
  IF start_d IS NULL THEN start_d := today; END IF;
  IF end_d IS NULL THEN end_d := today; END IF;
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
    SELECT i.id, i.current_value, i.acquisition_price, i.acquisition_date,
      EXISTS (SELECT 1 FROM public.value_history vh WHERE vh.item_id = i.id) AS has_history
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
      ), CASE WHEN d.as_of >= today OR NOT p.has_history THEN coalesce(p.current_value, 0) ELSE 0 END)
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

COMMIT;

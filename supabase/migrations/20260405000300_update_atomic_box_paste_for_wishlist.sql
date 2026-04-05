DROP FUNCTION IF EXISTS public.paste_box_trees_atomic(UUID, UUID, INTEGER, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS public.paste_box_trees_atomic(UUID, UUID, INTEGER, JSONB, JSONB);

CREATE OR REPLACE FUNCTION public.paste_box_trees_atomic(
  p_user_id UUID,
  p_target_parent_box_id UUID,
  p_cap INTEGER,
  p_nodes JSONB,
  p_items JSONB,
  p_wishlist_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_current_count INTEGER := 0;
  v_new_item_count INTEGER := 0;
  v_inserted_this_round INTEGER := 0;
  v_new_box_id UUID;
  v_new_item_id UUID;
  v_target_box_id UUID;
  v_root_ids UUID[] := '{}';
  v_node RECORD;
  v_item RECORD;
BEGIN
  CREATE TEMP TABLE tmp_nodes (
    temp_id UUID PRIMARY KEY,
    parent_temp_id UUID NULL,
    name TEXT NOT NULL,
    description TEXT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    new_box_id UUID NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_items (
    box_temp_id UUID NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT NULL,
    current_value NUMERIC NULL,
    acquisition_date DATE NULL,
    acquisition_price NUMERIC NULL,
    thumbnail_url TEXT NULL,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    tag_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    value_history JSONB NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_wishlist_items (
    box_temp_id UUID NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT NULL,
    current_value NUMERIC NULL,
    expected_price NUMERIC NULL,
    thumbnail_url TEXT NULL,
    photos JSONB NOT NULL DEFAULT '[]'::jsonb,
    tag_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    value_history JSONB NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_nodes (temp_id, parent_temp_id, name, description, position)
  SELECT
    (n->>'temp_id')::UUID,
    NULLIF(n->>'parent_temp_id', '')::UUID,
    COALESCE(n->>'name', ''),
    NULLIF(n->>'description', ''),
    COALESCE((n->>'position')::INTEGER, 0)
  FROM jsonb_array_elements(COALESCE(p_nodes, '[]'::jsonb)) AS n;

  IF NOT EXISTS (SELECT 1 FROM tmp_nodes) THEN
    RAISE EXCEPTION 'nodes payload is required';
  END IF;

  IF EXISTS (SELECT 1 FROM tmp_nodes WHERE btrim(name) = '') THEN
    RAISE EXCEPTION 'all boxes must have non-empty names';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_nodes n
    WHERE n.parent_temp_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tmp_nodes p WHERE p.temp_id = n.parent_temp_id)
  ) THEN
    RAISE EXCEPTION 'invalid parent_temp_id in nodes payload';
  END IF;

  INSERT INTO tmp_items (
    box_temp_id,
    position,
    name,
    description,
    current_value,
    acquisition_date,
    acquisition_price,
    thumbnail_url,
    photos,
    tag_ids,
    value_history
  )
  SELECT
    (i->>'box_temp_id')::UUID,
    COALESCE((i->>'position')::INTEGER, 0),
    COALESCE(i->>'name', ''),
    NULLIF(i->>'description', ''),
    CASE WHEN i ? 'current_value' THEN (i->>'current_value')::NUMERIC ELSE NULL END,
    NULLIF(i->>'acquisition_date', '')::DATE,
    CASE WHEN i ? 'acquisition_price' THEN (i->>'acquisition_price')::NUMERIC ELSE NULL END,
    NULLIF(i->>'thumbnail_url', ''),
    COALESCE(i->'photos', '[]'::jsonb),
    COALESCE(i->'tag_ids', '[]'::jsonb),
    CASE WHEN i ? 'value_history' THEN i->'value_history' ELSE NULL END
  FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS i;

  INSERT INTO tmp_wishlist_items (
    box_temp_id,
    position,
    name,
    description,
    current_value,
    expected_price,
    thumbnail_url,
    photos,
    tag_ids,
    value_history
  )
  SELECT
    (i->>'box_temp_id')::UUID,
    COALESCE((i->>'position')::INTEGER, 0),
    COALESCE(i->>'name', ''),
    NULLIF(i->>'description', ''),
    CASE WHEN i ? 'current_value' THEN (i->>'current_value')::NUMERIC ELSE NULL END,
    CASE WHEN i ? 'expected_price' THEN (i->>'expected_price')::NUMERIC ELSE NULL END,
    NULLIF(i->>'thumbnail_url', ''),
    COALESCE(i->'photos', '[]'::jsonb),
    COALESCE(i->'tag_ids', '[]'::jsonb),
    CASE WHEN i ? 'value_history' THEN i->'value_history' ELSE NULL END
  FROM jsonb_array_elements(COALESCE(p_wishlist_items, '[]'::jsonb)) AS i;

  IF EXISTS (SELECT 1 FROM tmp_items WHERE btrim(name) = '')
    OR EXISTS (SELECT 1 FROM tmp_wishlist_items WHERE btrim(name) = '') THEN
    RAISE EXCEPTION 'all items must have non-empty names';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_items i
    WHERE NOT EXISTS (SELECT 1 FROM tmp_nodes n WHERE n.temp_id = i.box_temp_id)
  ) OR EXISTS (
    SELECT 1
    FROM tmp_wishlist_items i
    WHERE NOT EXISTS (SELECT 1 FROM tmp_nodes n WHERE n.temp_id = i.box_temp_id)
  ) THEN
    RAISE EXCEPTION 'invalid box_temp_id in items payload';
  END IF;

  PERFORM 1 FROM public.users WHERE id = p_user_id FOR UPDATE;

  IF p_cap IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_count
    FROM public.items
    WHERE user_id = p_user_id
      AND is_wishlist = FALSE;

    SELECT COUNT(*) INTO v_new_item_count FROM tmp_items;

    IF v_current_count + v_new_item_count > p_cap THEN
      RAISE EXCEPTION 'item_limit_reached:%:%', v_current_count, p_cap USING ERRCODE = 'P0001';
    END IF;
  END IF;

  LOOP
    v_inserted_this_round := 0;

    FOR v_node IN
      SELECT
        n.temp_id,
        n.parent_temp_id,
        n.name,
        n.description,
        n.position,
        p.new_box_id AS parent_new_box_id
      FROM tmp_nodes n
      LEFT JOIN tmp_nodes p ON p.temp_id = n.parent_temp_id
      WHERE n.new_box_id IS NULL
        AND (n.parent_temp_id IS NULL OR p.new_box_id IS NOT NULL)
      ORDER BY n.parent_temp_id NULLS FIRST, n.position, n.temp_id
    LOOP
      INSERT INTO public.boxes (
        user_id,
        parent_box_id,
        name,
        description,
        is_public,
        position
      )
      VALUES (
        p_user_id,
        COALESCE(v_node.parent_new_box_id, p_target_parent_box_id),
        v_node.name,
        v_node.description,
        FALSE,
        v_node.position
      )
      RETURNING id INTO v_new_box_id;

      UPDATE tmp_nodes
      SET new_box_id = v_new_box_id
      WHERE temp_id = v_node.temp_id;

      v_inserted_this_round := v_inserted_this_round + 1;
    END LOOP;

    EXIT WHEN v_inserted_this_round = 0;
  END LOOP;

  IF EXISTS (SELECT 1 FROM tmp_nodes WHERE new_box_id IS NULL) THEN
    RAISE EXCEPTION 'failed to resolve full box tree';
  END IF;

  FOR v_item IN
    SELECT *
    FROM tmp_items
    ORDER BY position
  LOOP
    SELECT n.new_box_id
    INTO v_target_box_id
    FROM tmp_nodes n
    WHERE n.temp_id = v_item.box_temp_id;

    IF v_target_box_id IS NULL THEN
      RAISE EXCEPTION 'missing target box for item';
    END IF;

    INSERT INTO public.items (
      box_id,
      wishlist_target_box_id,
      user_id,
      name,
      description,
      thumbnail_url,
      current_value,
      acquisition_date,
      acquisition_price,
      is_wishlist,
      expected_price,
      position
    )
    VALUES (
      v_target_box_id,
      NULL,
      p_user_id,
      v_item.name,
      v_item.description,
      v_item.thumbnail_url,
      v_item.current_value,
      v_item.acquisition_date,
      v_item.acquisition_price,
      FALSE,
      NULL,
      v_item.position
    )
    RETURNING id INTO v_new_item_id;

    IF jsonb_typeof(v_item.photos) = 'array' AND jsonb_array_length(v_item.photos) > 0 THEN
      INSERT INTO public.photos (item_id, url, storage_path, is_thumbnail)
      SELECT
        v_new_item_id,
        p.url,
        p.storage_path,
        p.is_thumbnail
      FROM jsonb_to_recordset(v_item.photos) AS p(url TEXT, storage_path TEXT, is_thumbnail BOOLEAN);
    END IF;

    IF jsonb_typeof(v_item.tag_ids) = 'array' AND jsonb_array_length(v_item.tag_ids) > 0 THEN
      INSERT INTO public.item_tags (item_id, tag_id)
      SELECT
        v_new_item_id,
        t.id
      FROM jsonb_array_elements_text(v_item.tag_ids) AS raw(tag_id_text)
      JOIN public.tags t
        ON t.id = raw.tag_id_text::UUID
       AND t.user_id = p_user_id
      ON CONFLICT DO NOTHING;
    END IF;

    IF v_item.value_history IS NOT NULL
      AND jsonb_typeof(v_item.value_history) = 'array'
      AND jsonb_array_length(v_item.value_history) > 0 THEN
      INSERT INTO public.value_history (item_id, value, recorded_at)
      SELECT
        v_new_item_id,
        vh.value,
        vh.recorded_at
      FROM jsonb_to_recordset(v_item.value_history) AS vh(value NUMERIC, recorded_at TIMESTAMPTZ);
    ELSIF v_item.value_history IS NULL AND v_item.current_value IS NOT NULL THEN
      INSERT INTO public.value_history (item_id, value)
      VALUES (v_new_item_id, v_item.current_value);
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT *
    FROM tmp_wishlist_items
    ORDER BY position
  LOOP
    SELECT n.new_box_id
    INTO v_target_box_id
    FROM tmp_nodes n
    WHERE n.temp_id = v_item.box_temp_id;

    IF v_target_box_id IS NULL THEN
      RAISE EXCEPTION 'missing target box for wishlist item';
    END IF;

    INSERT INTO public.items (
      box_id,
      wishlist_target_box_id,
      user_id,
      name,
      description,
      thumbnail_url,
      current_value,
      acquisition_date,
      acquisition_price,
      is_wishlist,
      expected_price,
      position
    )
    VALUES (
      NULL,
      v_target_box_id,
      p_user_id,
      v_item.name,
      v_item.description,
      v_item.thumbnail_url,
      v_item.current_value,
      NULL,
      NULL,
      TRUE,
      v_item.expected_price,
      v_item.position
    )
    RETURNING id INTO v_new_item_id;

    IF jsonb_typeof(v_item.photos) = 'array' AND jsonb_array_length(v_item.photos) > 0 THEN
      INSERT INTO public.photos (item_id, url, storage_path, is_thumbnail)
      SELECT
        v_new_item_id,
        p.url,
        p.storage_path,
        p.is_thumbnail
      FROM jsonb_to_recordset(v_item.photos) AS p(url TEXT, storage_path TEXT, is_thumbnail BOOLEAN);
    END IF;

    IF jsonb_typeof(v_item.tag_ids) = 'array' AND jsonb_array_length(v_item.tag_ids) > 0 THEN
      INSERT INTO public.item_tags (item_id, tag_id)
      SELECT
        v_new_item_id,
        t.id
      FROM jsonb_array_elements_text(v_item.tag_ids) AS raw(tag_id_text)
      JOIN public.tags t
        ON t.id = raw.tag_id_text::UUID
       AND t.user_id = p_user_id
      ON CONFLICT DO NOTHING;
    END IF;

    IF v_item.value_history IS NOT NULL
      AND jsonb_typeof(v_item.value_history) = 'array'
      AND jsonb_array_length(v_item.value_history) > 0 THEN
      INSERT INTO public.value_history (item_id, value, recorded_at)
      SELECT
        v_new_item_id,
        vh.value,
        vh.recorded_at
      FROM jsonb_to_recordset(v_item.value_history) AS vh(value NUMERIC, recorded_at TIMESTAMPTZ);
    ELSIF v_item.value_history IS NULL AND v_item.current_value IS NOT NULL THEN
      INSERT INTO public.value_history (item_id, value)
      VALUES (v_new_item_id, v_item.current_value);
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(new_box_id ORDER BY position), '{}')
  INTO v_root_ids
  FROM tmp_nodes
  WHERE parent_temp_id IS NULL;

  RETURN jsonb_build_object(
    'created_box_ids', v_root_ids,
    'created_items', (SELECT COUNT(*) FROM tmp_items) + (SELECT COUNT(*) FROM tmp_wishlist_items)
  );
END;
$$;

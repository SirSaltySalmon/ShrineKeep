-- Item cap: one SQL definition of the cap, and one lock order for every writer.
--
-- Cap definition. enforce_item_cap wrote the free-tier numbers out twice, and
-- paste_box_trees_atomic checked whatever cap its caller passed in. Both now
-- ask public.item_cap_for_user, the only place SQL states the numbers.
-- FREE_TIER_CAP, PAST_DUE_GRACE_DAYS and getEffectiveCap in lib/subscription.ts
-- are the app's copy; lib/subscription.test.ts fails when the two disagree.
--
-- Lock order. Writers take the owner's account lock (sharing_private.lock_accounts)
-- before row locks, and the sharing_revision bump that follows most writes
-- updates the owner's users row. Two paths locked the users row first and
-- then waited for the account lock, so either could deadlock against an
-- ordinary item or box write for the same owner (two tabs are enough):
--   * paste_box_trees_atomic ran SELECT ... FOR UPDATE on users before the
--     box inserts whose triggers take the account lock;
--   * a direct UPDATE of users.name (the settings route) locks the row, and
--     its AFTER trigger sharing_users_name_revision then took the account lock.
-- Both now take the account lock first. enforce_item_cap also stops
-- row-locking users: it now fires after sharing_items_targets, which checks
-- the owner and holds their account lock, and that lock serializes cap
-- decisions as it does every other per-owner invariant.
-- supabase/tests/concurrency.mjs reproduces both deadlocks.
BEGIN;

-- NULL means no cap: Pro, or past_due within the grace period.
-- Invoker, so callers read subscriptions and users under their own RLS.
CREATE FUNCTION public.item_cap_for_user(p_user_id uuid) RETURNS integer
LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH plan AS (
    SELECT 100 AS free_tier_cap, interval '7 days' AS past_due_grace
  )
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = p_user_id
        AND (s.status = 'active'
          OR (s.status = 'past_due' AND now() <= s.current_period_end + plan.past_due_grace))
    ) THEN NULL
    ELSE greatest(plan.free_tier_cap, coalesce(
      (SELECT u.grandfathered_item_count FROM public.users u WHERE u.id = p_user_id), 0))
  END
  FROM plan
$$;
COMMENT ON FUNCTION public.item_cap_for_user(uuid) IS
  'Collection-item cap for a user, NULL when uncapped. The only SQL statement of FREE_TIER_CAP and PAST_DUE_GRACE_DAYS (lib/subscription.ts).';
REVOKE ALL ON FUNCTION public.item_cap_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.item_cap_for_user(uuid) TO authenticated, service_role;

-- Invoker context so current_user is the real database role (as in
-- protect_publication_state) and reads stay under the caller's RLS.
CREATE OR REPLACE FUNCTION sharing_private.enforce_item_cap() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_cap integer;
  v_count integer;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  -- Already a collection item for this owner: not a new slot.
  IF TG_OP = 'UPDATE' AND NOT OLD.is_wishlist AND NEW.user_id = OLD.user_id THEN
    RETURN NEW;
  END IF;

  v_cap := public.item_cap_for_user(NEW.user_id);
  IF v_cap IS NULL THEN
    RETURN NEW;
  END IF;

  -- sharing_items_targets has already taken NEW.user_id's account lock, so no
  -- other write for this owner runs between this count and the insert.
  -- BEFORE ROW: rows inserted earlier in the same statement are visible here.
  SELECT count(*) INTO v_count FROM public.items i
  WHERE i.user_id = NEW.user_id AND NOT i.is_wishlist;

  IF v_count >= v_cap THEN
    RAISE EXCEPTION 'item_limit_reached:%:%', v_count, v_cap USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION sharing_private.enforce_item_cap() FROM PUBLIC, anon, authenticated, service_role;

-- Triggers on one event fire in name order. This name sorts after
-- sharing_items_targets, which rejects a foreign owner and takes the owner's
-- account lock before the cap is counted.
DROP TRIGGER enforce_item_cap ON public.items;
CREATE TRIGGER sharing_items_targets_cap BEFORE INSERT OR UPDATE OF is_wishlist, user_id ON public.items
  FOR EACH ROW WHEN (NOT NEW.is_wishlist) EXECUTE FUNCTION sharing_private.enforce_item_cap();

-- Take the account lock before UPDATE locks any users row, as items, boxes
-- and value_history already do. Service-role writers lock first themselves.
CREATE TRIGGER sharing_users_statement BEFORE UPDATE ON public.users
  FOR EACH STATEMENT EXECUTE FUNCTION sharing_private.lock_box_statement();

-- Unchanged from 20260908201000 except the cap check: no users row lock, the
-- count moved after the box inserts, and the cap read from item_cap_for_user.
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
  v_cap INTEGER;
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
        position
      )
      VALUES (
        p_user_id,
        COALESCE(v_node.parent_new_box_id, p_target_parent_box_id),
        v_node.name,
        v_node.description,
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

  -- Count only now. Inserting the boxes took p_user_id's account lock
  -- (sharing_boxes_tree), so no other write for this owner can land between
  -- this count and the item inserts below. The cap is the database's own
  -- (public.item_cap_for_user); p_cap is ignored and kept for callers.
  SELECT COUNT(*) INTO v_new_item_count FROM tmp_items;
  v_cap := public.item_cap_for_user(p_user_id);

  IF v_new_item_count > 0 AND v_cap IS NOT NULL THEN
    SELECT COUNT(*) INTO v_current_count
    FROM public.items
    WHERE user_id = p_user_id
      AND is_wishlist = FALSE;

    IF v_current_count + v_new_item_count > v_cap THEN
      RAISE EXCEPTION 'item_limit_reached:%:%', v_current_count, v_cap USING ERRCODE = 'P0001';
    END IF;
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

COMMIT;

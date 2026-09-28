-- Run after schema.sql + sharing/media migrations, using psql ON_ERROR_STOP=1.
BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('c1000000-0000-4000-8000-000000000001', 'box-delete@test.invalid', '{"username":"box-delete"}'),
 ('c1000000-0000-4000-8000-000000000002', 'box-delete-other@test.invalid', '{"username":"box-delete-other"}');

INSERT INTO public.boxes (id, user_id, parent_box_id, name) VALUES
 ('c2000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', NULL, 'Parent'),
 ('c2000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Child'),
 ('c2000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000002', 'Grandchild'),
 ('c2000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', NULL, 'Delete-all root'),
 ('c2000000-0000-4000-8000-000000000005', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000004', 'Delete-all child'),
 ('c2000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000002', NULL, 'Other owner'),
 ('c2000000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000001', NULL, 'Depth top'),
 ('c2000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000011', 'Depth mid'),
 ('c2000000-0000-4000-8000-000000000013', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000012', 'Depth low'),
 ('c2000000-0000-4000-8000-000000000014', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000013', 'Depth deep'),
 ('c2000000-0000-4000-8000-000000000021', 'c1000000-0000-4000-8000-000000000001', NULL, 'Keep'),
 ('c2000000-0000-4000-8000-000000000022', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000021', 'Anc'),
 ('c2000000-0000-4000-8000-000000000023', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000022', 'Gap'),
 ('c2000000-0000-4000-8000-000000000024', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000023', 'Inner'),
 ('c2000000-0000-4000-8000-000000000031', 'c1000000-0000-4000-8000-000000000001', NULL, 'Public parent'),
 ('c2000000-0000-4000-8000-000000000032', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000031', 'Friends child');

UPDATE public.user_settings SET root_wishlist_visibility='public'
 WHERE user_id='c1000000-0000-4000-8000-000000000001';
UPDATE public.boxes SET collection_visibility='private', wishlist_visibility='friends'
 WHERE id='c2000000-0000-4000-8000-000000000001';
UPDATE public.boxes SET collection_visibility='private', wishlist_visibility='private'
 WHERE id='c2000000-0000-4000-8000-000000000003';

INSERT INTO public.items (id, user_id, box_id, name, is_wishlist, wishlist_target_box_id) VALUES
 ('c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Parent item', false, NULL),
 ('c3000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', 'Grandchild item', false, NULL),
 ('c3000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', NULL, 'Outside wish', true, 'c2000000-0000-4000-8000-000000000001'),
 ('c3000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000005', 'Doomed item', false, NULL),
 ('c3000000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000012', 'Mid item', false, NULL),
 ('c3000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000014', 'Deep item', false, NULL),
 ('c3000000-0000-4000-8000-000000000021', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000024', 'Inner item', false, NULL),
 ('c3000000-0000-4000-8000-000000000031', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000032', 'Friends item', false, NULL),
 ('c3000000-0000-4000-8000-000000000032', 'c1000000-0000-4000-8000-000000000001', NULL, 'Friends wish', true, 'c2000000-0000-4000-8000-000000000032');

INSERT INTO public.photos (id, item_id, url, storage_path) VALUES
 ('c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000004', 'https://example.test/doomed.jpg', 'c1000000-0000-4000-8000-000000000001/items/doomed.jpg');

SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := 'c1000000-0000-4000-8000-000000000001';
  parent uuid := 'c2000000-0000-4000-8000-000000000001';
  child uuid := 'c2000000-0000-4000-8000-000000000002';
  grandchild uuid := 'c2000000-0000-4000-8000-000000000003';
  depth_top uuid := 'c2000000-0000-4000-8000-000000000011';
  depth_mid uuid := 'c2000000-0000-4000-8000-000000000012';
  depth_low uuid := 'c2000000-0000-4000-8000-000000000013';
  depth_deep uuid := 'c2000000-0000-4000-8000-000000000014';
  keep uuid := 'c2000000-0000-4000-8000-000000000021';
  anc uuid := 'c2000000-0000-4000-8000-000000000022';
  gap uuid := 'c2000000-0000-4000-8000-000000000023';
  inner_box uuid := 'c2000000-0000-4000-8000-000000000024';
  public_parent uuid := 'c2000000-0000-4000-8000-000000000031';
  friends_child uuid := 'c2000000-0000-4000-8000-000000000032';
  result jsonb;
  before_revision bigint;
BEGIN
  result := public.sharing_delete_boxes(NULL, ARRAY[parent], 'move-up');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'authentication_required', 'null actor denied');
  result := public.sharing_delete_boxes(actor, ARRAY[parent], 'explode');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'invalid_input', 'unknown mode denied');
  result := public.sharing_delete_boxes(actor, ARRAY[parent, NULL], 'move-up');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'invalid_input', 'null box id denied');
  result := public.sharing_delete_boxes(actor, ARRAY['c2000000-0000-4000-8000-000000000006'::uuid], 'delete-all');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'not_found', 'other owner denied');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.boxes WHERE id='c2000000-0000-4000-8000-000000000006'), 'other owner untouched');

  result := public.sharing_delete_boxes(actor, ARRAY[depth_mid], 'move-up');
  PERFORM pg_temp.assert_true((result->>'ok')::boolean, 'mid-level move-up succeeds');
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.boxes WHERE id = depth_mid), 'mid-level box deleted');
  PERFORM pg_temp.assert_true((SELECT parent_box_id FROM public.boxes WHERE id = depth_low) = depth_top, 'direct child moved to parent');
  PERFORM pg_temp.assert_true((SELECT parent_box_id FROM public.boxes WHERE id = depth_deep) = depth_low, 'nesting below the child is unchanged');
  PERFORM pg_temp.assert_true((SELECT box_id FROM public.items WHERE id='c3000000-0000-4000-8000-000000000011') = depth_top, 'direct items moved to parent');
  PERFORM pg_temp.assert_true((SELECT box_id FROM public.items WHERE id='c3000000-0000-4000-8000-000000000012') = depth_deep, 'deeper items stay in their box');

  result := public.sharing_delete_boxes(actor, ARRAY[anc, gap], 'move-up');
  PERFORM pg_temp.assert_true((result->>'ok')::boolean, 'ancestor-and-descendant move-up succeeds');
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.boxes WHERE id IN (anc, gap)), 'both selected boxes deleted');
  PERFORM pg_temp.assert_true((SELECT parent_box_id FROM public.boxes WHERE id = inner_box) = keep, 'inner contents land on nearest surviving ancestor');
  PERFORM pg_temp.assert_true((SELECT parent_box_id FROM public.boxes WHERE id = inner_box) IS DISTINCT FROM anc
    AND (SELECT parent_box_id FROM public.boxes WHERE id = inner_box) IS DISTINCT FROM gap, 'inner contents never land on a deleted box');
  PERFORM pg_temp.assert_true((SELECT box_id FROM public.items WHERE id='c3000000-0000-4000-8000-000000000021') = inner_box, 'item under inner stays nested');

  UPDATE public.user_settings SET
    root_collection_visibility='public', root_wishlist_visibility='public'
  WHERE user_id=actor;
  UPDATE public.boxes SET collection_visibility='public', wishlist_visibility='public' WHERE id=public_parent;
  UPDATE public.boxes SET collection_visibility='friends', wishlist_visibility='friends' WHERE id=friends_child;

  BEGIN
    UPDATE public.items SET wishlist_target_box_id = public_parent
      WHERE id='c3000000-0000-4000-8000-000000000032';
    RAISE EXCEPTION 'ordinary retarget should conflict';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'privacy_conflict' THEN RAISE; END IF;
  END;
  PERFORM pg_temp.assert_true((
    SELECT wishlist_target_box_id = friends_child FROM public.items
    WHERE id='c3000000-0000-4000-8000-000000000032'
  ), 'ordinary wider retarget still raises privacy_conflict');

  result := public.sharing_delete_boxes(actor, ARRAY[friends_child], 'move-up');
  PERFORM pg_temp.assert_true((result->>'ok')::boolean, 'friends-under-public move-up does not raise privacy_conflict');
  PERFORM pg_temp.assert_true((SELECT box_id FROM public.items WHERE id='c3000000-0000-4000-8000-000000000031') = public_parent, 'friends-box items land on public parent');
  PERFORM pg_temp.assert_true(sharing_private.owned_item_is_visible('c3000000-0000-4000-8000-000000000031', NULL), 'collection item follows public parent');
  PERFORM pg_temp.assert_true((
    SELECT wishlist_target_box_id = public_parent
    FROM public.items WHERE id='c3000000-0000-4000-8000-000000000032'
  ), 'wishlist retargets to public parent');
  PERFORM pg_temp.assert_true(sharing_private.wishlist_item_is_visible('c3000000-0000-4000-8000-000000000032', NULL), 'wish follows public parent');

  SELECT sharing_revision INTO before_revision FROM public.users WHERE id = actor;
  result := public.sharing_delete_boxes(actor, ARRAY[parent, parent], 'move-up');
  PERFORM pg_temp.assert_true((result->'data'->>'deletedCount')::int = 1, 'duplicate ids count once');
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.boxes WHERE id = parent), 'selected parent deleted');
  PERFORM pg_temp.assert_true((SELECT parent_box_id IS NULL FROM public.boxes WHERE id = child), 'top-level delete puts child at collection root');
  PERFORM pg_temp.assert_true((SELECT parent_box_id FROM public.boxes WHERE id = grandchild) = child, 'grandchild stays nested under the surviving child');
  PERFORM pg_temp.assert_true((SELECT box_id IS NULL FROM public.items WHERE id='c3000000-0000-4000-8000-000000000001'), 'parent item unboxed at collection root');
  PERFORM pg_temp.assert_true((SELECT box_id FROM public.items WHERE id='c3000000-0000-4000-8000-000000000002') = grandchild, 'descendant item stays in grandchild');
  PERFORM pg_temp.assert_true((
    SELECT wishlist_target_box_id IS NULL AND wishlist_detached_visibility='friends'
    FROM public.items WHERE id='c3000000-0000-4000-8000-000000000003'
  ), 'wishlist targeting deleted top-level box detaches with saved audience');
  PERFORM pg_temp.assert_true((SELECT sharing_revision > before_revision FROM public.users WHERE id = actor), 'revision advanced');
  PERFORM pg_temp.assert_true((SELECT wishlist_visibility='private' FROM public.boxes WHERE id = grandchild), 'surviving box keeps saved sharing');

  result := public.sharing_delete_boxes(actor, ARRAY['c2000000-0000-4000-8000-000000000004'::uuid], 'delete-all');
  PERFORM pg_temp.assert_true((result->'data'->>'deletedCount')::int = 1, 'delete-all removes selected');
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.boxes WHERE id IN ('c2000000-0000-4000-8000-000000000004','c2000000-0000-4000-8000-000000000005')), 'delete-all cascades descendants');
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.items WHERE id='c3000000-0000-4000-8000-000000000004'), 'delete-all removes boxed items');
  PERFORM pg_temp.assert_true(result->'data'->'photos' @> '[{"id":"c4000000-0000-4000-8000-000000000001","storage_path":"c1000000-0000-4000-8000-000000000001/items/doomed.jpg"}]'::jsonb, 'delete-all returns photo inventory');

  INSERT INTO public.boxes (id, user_id, parent_box_id, name) VALUES
   ('c2000000-0000-4000-8000-000000000007', actor, NULL, 'Nested parent'),
   ('c2000000-0000-4000-8000-000000000008', actor, 'c2000000-0000-4000-8000-000000000007', 'Nested child');
  result := public.sharing_delete_boxes(actor, ARRAY['c2000000-0000-4000-8000-000000000007'::uuid,'c2000000-0000-4000-8000-000000000008'::uuid], 'delete-all');
  PERFORM pg_temp.assert_true((result->'data'->>'deletedCount')::int = 2, 'nested delete-all counts both selected ids');
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.boxes WHERE id IN ('c2000000-0000-4000-8000-000000000007','c2000000-0000-4000-8000-000000000008')), 'nested delete-all removes both');
END $$;
RESET ROLE;

SET LOCAL session_replication_role = replica;
UPDATE public.boxes SET parent_box_id='c2000000-0000-4000-8000-000000000002'
 WHERE id='c2000000-0000-4000-8000-000000000003';
UPDATE public.boxes SET parent_box_id='c2000000-0000-4000-8000-000000000003'
 WHERE id='c2000000-0000-4000-8000-000000000002';
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true((
  public.sharing_delete_boxes('c1000000-0000-4000-8000-000000000001', ARRAY['c2000000-0000-4000-8000-000000000002'::uuid], 'move-up')
)->'error'->>'code' = 'invalid_input'
, 'cycle denied');
SELECT pg_temp.assert_true((SELECT count(*) = 1 FROM public.boxes WHERE id='c2000000-0000-4000-8000-000000000002'), 'cycle leaves rows');
RESET ROLE;

SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.sharing_delete_boxes('c1000000-0000-4000-8000-000000000001', ARRAY['c2000000-0000-4000-8000-000000000002'::uuid], 'delete-all');
    RAISE EXCEPTION 'client forged actor';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;

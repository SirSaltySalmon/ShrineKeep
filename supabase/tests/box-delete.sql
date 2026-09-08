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
 ('c2000000-0000-4000-8000-000000000006', 'c1000000-0000-4000-8000-000000000002', NULL, 'Other owner');

UPDATE public.user_settings SET root_wishlist_visibility='public'
 WHERE user_id='c1000000-0000-4000-8000-000000000001';
UPDATE public.boxes SET collection_visibility='private', wishlist_visibility='friends'
 WHERE id='c2000000-0000-4000-8000-000000000001';
UPDATE public.boxes SET collection_visibility='private', wishlist_visibility='private'
 WHERE id='c2000000-0000-4000-8000-000000000003';

INSERT INTO public.items (id, user_id, box_id, name, is_wishlist, wishlist_is_private, wishlist_target_box_id) VALUES
 ('c3000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000001', 'Parent item', false, false, NULL),
 ('c3000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000003', 'Grandchild item', false, false, NULL),
 ('c3000000-0000-4000-8000-000000000003', 'c1000000-0000-4000-8000-000000000001', NULL, 'Outside wish', true, true, 'c2000000-0000-4000-8000-000000000001'),
 ('c3000000-0000-4000-8000-000000000004', 'c1000000-0000-4000-8000-000000000001', 'c2000000-0000-4000-8000-000000000005', 'Doomed item', false, false, NULL);

INSERT INTO public.photos (id, item_id, url, storage_path) VALUES
 ('c4000000-0000-4000-8000-000000000001', 'c3000000-0000-4000-8000-000000000004', 'https://example.test/doomed.jpg', 'c1000000-0000-4000-8000-000000000001/items/doomed.jpg');

SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := 'c1000000-0000-4000-8000-000000000001';
  parent uuid := 'c2000000-0000-4000-8000-000000000001';
  child uuid := 'c2000000-0000-4000-8000-000000000002';
  grandchild uuid := 'c2000000-0000-4000-8000-000000000003';
  result jsonb;
  before_revision bigint;
BEGIN
  result := public.sharing_delete_boxes(NULL, ARRAY[parent], 'move-to-root');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'authentication_required', 'null actor denied');
  result := public.sharing_delete_boxes(actor, ARRAY[parent], 'explode');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'invalid_input', 'unknown mode denied');
  result := public.sharing_delete_boxes(actor, ARRAY[parent, NULL], 'move-to-root');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'invalid_input', 'null box id denied');
  result := public.sharing_delete_boxes(actor, ARRAY['c2000000-0000-4000-8000-000000000006'::uuid], 'delete-all');
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'not_found', 'other owner denied');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.boxes WHERE id='c2000000-0000-4000-8000-000000000006'), 'other owner untouched');

  SELECT sharing_revision INTO before_revision FROM public.users WHERE id = actor;
  result := public.sharing_delete_boxes(actor, ARRAY[parent, parent], 'move-to-root');
  PERFORM pg_temp.assert_true((result->'data'->>'deletedCount')::int = 1, 'duplicate ids count once');
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM public.boxes WHERE id = parent), 'selected parent deleted');
  PERFORM pg_temp.assert_true((SELECT parent_box_id IS NULL FROM public.boxes WHERE id = child), 'child promoted to root');
  PERFORM pg_temp.assert_true((SELECT parent_box_id IS NULL FROM public.boxes WHERE id = grandchild), 'grandchild flattened to root');
  PERFORM pg_temp.assert_true((SELECT box_id IS NULL FROM public.items WHERE id='c3000000-0000-4000-8000-000000000001'), 'parent item unboxed');
  PERFORM pg_temp.assert_true((SELECT box_id IS NULL FROM public.items WHERE id='c3000000-0000-4000-8000-000000000002'), 'descendant item unboxed');
  PERFORM pg_temp.assert_true((
    SELECT wishlist_target_box_id IS NULL AND wishlist_is_private AND wishlist_detached_visibility='friends'
    FROM public.items WHERE id='c3000000-0000-4000-8000-000000000003'
  ), 'wishlist targeting deleted box detaches with saved audience');
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
  public.sharing_delete_boxes('c1000000-0000-4000-8000-000000000001', ARRAY['c2000000-0000-4000-8000-000000000002'::uuid], 'move-to-root')
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

BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('f1000000-0000-4000-8000-000000000001','ceiling-owner@test.invalid','{"username":"ceiling-owner"}');

INSERT INTO public.boxes(id,user_id,parent_box_id,name) VALUES
 ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',NULL,'Root box'),
 ('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','Child'),
 ('f2000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002','Grandchild'),
 ('f2000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000001',NULL,'Paste dest'),
 ('f2000000-0000-4000-8000-000000000005','f1000000-0000-4000-8000-000000000001',NULL,'Wish target');

INSERT INTO public.items(id,user_id,box_id,name,current_value,acquisition_price,acquisition_date) VALUES
 ('f3000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001',NULL,'Loose item',50,50,'2020-01-01');
INSERT INTO public.items(id,user_id,is_wishlist,wishlist_target_box_id,name,expected_price) VALUES
 ('f3000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001',true,'f2000000-0000-4000-8000-000000000001','Box wish',1),
 ('f3000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-000000000001',true,'f2000000-0000-4000-8000-000000000005','Detach wish',2);

SELECT pg_temp.assert_true((
  SELECT collection_visibility='private' AND wishlist_visibility='private' AND NOT share_financials
  FROM public.boxes WHERE id='f2000000-0000-4000-8000-000000000001'
), 'insert inherits private root');

SET LOCAL ROLE service_role;
DO $$
DECLARE
  owner uuid := 'f1000000-0000-4000-8000-000000000001';
  root_box uuid := 'f2000000-0000-4000-8000-000000000001';
  child uuid := 'f2000000-0000-4000-8000-000000000002';
  grandchild uuid := 'f2000000-0000-4000-8000-000000000003';
  paste_dest uuid := 'f2000000-0000-4000-8000-000000000004';
  wish_target uuid := 'f2000000-0000-4000-8000-000000000005';
  preview jsonb; result jsonb; page jsonb; detail jsonb; rev bigint;
BEGIN
  BEGIN
    UPDATE public.boxes SET collection_visibility='public' WHERE id=root_box;
    RAISE EXCEPTION 'editor widened past private root';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'privacy_conflict' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE public.boxes SET collection_visibility='public' WHERE id=child;
    RAISE EXCEPTION 'child widened past private parent';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'privacy_conflict' THEN RAISE; END IF;
  END;

  INSERT INTO public.boxes(id,user_id,parent_box_id,name,collection_visibility,wishlist_visibility)
    VALUES ('f2000000-0000-4000-8000-000000000010', owner, child, 'Forced public', 'public', 'public');
  PERFORM pg_temp.assert_true((
    SELECT collection_visibility='private' AND wishlist_visibility='private'
    FROM public.boxes WHERE id='f2000000-0000-4000-8000-000000000010'
  ), 'create under private parent inherits, does not store a wider write');
  DELETE FROM public.boxes WHERE id='f2000000-0000-4000-8000-000000000010';

  UPDATE public.user_settings SET
    root_collection_visibility='public', root_wishlist_visibility='public'
  WHERE user_id=owner;

  SELECT sharing_revision INTO rev FROM public.users WHERE id=owner;
  result := public.sharing_update_box(owner, root_box, 'public', false, 'public', false, rev, 2);
  PERFORM pg_temp.assert_true((result->>'ok')::boolean, 'editor can match opened root');

  UPDATE public.boxes SET collection_visibility='public', wishlist_visibility='public' WHERE id=child;
  UPDATE public.boxes SET collection_visibility='public', wishlist_visibility='public' WHERE id=grandchild;

  UPDATE public.boxes SET parent_box_id=paste_dest WHERE id=grandchild;
  PERFORM pg_temp.assert_true((
    SELECT collection_visibility='private' AND wishlist_visibility='private' FROM public.boxes WHERE id=grandchild
  ), 'move under a narrower parent clamps both dimensions');

  UPDATE public.boxes SET parent_box_id=child WHERE id=grandchild;
  UPDATE public.boxes SET collection_visibility='public', wishlist_visibility='public' WHERE id=grandchild;

  SELECT sharing_revision INTO rev FROM public.users WHERE id=owner;
  preview := public.sharing_preview_box(owner, root_box, 'friends', false, 'friends', false);
  PERFORM pg_temp.assert_true((preview->'data'->>'descendantCount')::bigint = 2, 'OCC count is tree size');
  PERFORM pg_temp.assert_true((preview->'data'->>'affectedCount')::bigint = 3, 'restrict preview counts parent plus strictly wider descendants');
  result := public.sharing_update_box(owner, root_box, 'friends', false, 'friends', false, rev, 2);
  PERFORM pg_temp.assert_true((result->>'ok')::boolean, 'restrict save');
  PERFORM pg_temp.assert_true((
    SELECT bool_and(collection_visibility='friends' AND wishlist_visibility='friends')
    FROM public.boxes WHERE id IN (root_box, child, grandchild)
  ), 'restrict clamps only by least');

  SELECT sharing_revision INTO rev FROM public.users WHERE id=owner;
  preview := public.sharing_preview_box(owner, root_box, 'public', false, 'public', false);
  PERFORM pg_temp.assert_true((preview->'data'->>'affectedCount')::bigint = 1, 'widen preview changes only the parent');
  result := public.sharing_update_box(owner, root_box, 'public', false, 'public', false, rev, 2);
  PERFORM pg_temp.assert_true((
    SELECT collection_visibility='public' FROM public.boxes WHERE id=root_box
  ) AND (
    SELECT bool_and(collection_visibility='friends' AND wishlist_visibility='friends')
    FROM public.boxes WHERE id IN (child, grandchild)
  ), 'widening a parent changes no descendant');

  UPDATE public.boxes SET collection_visibility='private' WHERE id=root_box;
  PERFORM pg_temp.assert_true(
    sharing_private.wishlist_item_is_visible('f3000000-0000-4000-8000-000000000002', NULL),
    'private collection still publishes an independent public box wishlist');
  PERFORM pg_temp.assert_true(
    public.sharing_read_page(owner, NULL, 'boxes', root_box)->'error'->>'code' = 'not_found',
    'private collection hides the box from guests');

  UPDATE public.boxes SET collection_visibility='public', share_financials=false WHERE id=root_box;
  UPDATE public.boxes SET collection_visibility='public', share_financials=true WHERE id=child;
  INSERT INTO public.items(id,user_id,box_id,name,current_value,acquisition_price)
    VALUES ('f3000000-0000-4000-8000-000000000003', owner, child, 'Shared child', 7, 7);
  PERFORM pg_temp.assert_true((
    public.sharing_read_stats(owner, NULL, root_box)->'data'->>'currentValue'
  )::numeric = 7, 'parent with finances hidden still aggregates sharing children');

  UPDATE public.user_settings SET root_collection_visibility='private', root_wishlist_visibility='private'
    WHERE user_id=owner;
  PERFORM pg_temp.assert_true((
    SELECT bool_and(collection_visibility='private' AND wishlist_visibility='private')
    FROM public.boxes WHERE user_id=owner
  ), 'narrowing root clamps top-level and cascades');
  PERFORM pg_temp.assert_true(
    public.sharing_read_page(owner, NULL, 'boxes')->'data'->'rows' = '[]'::jsonb,
    'private root hides the account regardless of prior box settings');
  PERFORM pg_temp.assert_true(
    public.sharing_read_page(owner, NULL, 'items')->'error'->>'code' = 'not_found',
    'loose items hidden while root collection is unpublished');
  PERFORM pg_temp.assert_true(
    NOT sharing_private.wishlist_item_is_visible('f3000000-0000-4000-8000-000000000002', NULL),
    'private root wishlist hides every box wishlist');

  UPDATE public.user_settings SET
    root_collection_visibility='public', root_wishlist_visibility='public', root_share_financials=true
  WHERE user_id=owner;
  page := public.sharing_read_page(owner, NULL, 'items');
  PERFORM pg_temp.assert_true(page->'data'->'rows'->0->'item'->>'name' = 'Loose item', 'loose owned items follow root audience');
  PERFORM pg_temp.assert_true((page->'data'->'rows'->0->'item'->>'currentValue')::numeric = 50, 'loose items use root financials');
  detail := public.sharing_read_item_detail(owner, NULL, 'f3000000-0000-4000-8000-000000000001', 'items');
  PERFORM pg_temp.assert_true((detail->>'ok')::boolean AND NOT (detail->'data' ? 'tags'), 'public detail paginates photos only');

  UPDATE public.boxes SET wishlist_visibility='friends' WHERE id=wish_target;
  DELETE FROM public.boxes WHERE id=wish_target;
  PERFORM pg_temp.assert_true((
    SELECT wishlist_target_box_id IS NULL AND wishlist_detached_visibility='friends'
      AND wishlist_detached_visibility <= sharing_private.container_audience(owner, NULL, 'wishlist')
    FROM public.items WHERE id='f3000000-0000-4000-8000-000000000004'
  ), 'deleted top-level box preserves detached wishlist audience dominated by root');

  PERFORM pg_temp.assert_true(NOT EXISTS (
    SELECT 1 FROM public.boxes b
    WHERE b.user_id=owner
      AND (b.collection_visibility > sharing_private.container_audience(b.user_id, b.parent_box_id, 'collection')
        OR b.wishlist_visibility > sharing_private.container_audience(b.user_id, b.parent_box_id, 'wishlist'))
  ), 'invariant holds after the fixture writes');
END $$;

UPDATE public.user_settings SET root_collection_visibility='private', root_wishlist_visibility='private'
 WHERE user_id='f1000000-0000-4000-8000-000000000001';
SELECT public.paste_box_trees_atomic(
  'f1000000-0000-4000-8000-000000000001',
  'f2000000-0000-4000-8000-000000000004',
  50,
  '[{"temp_id":"f2100000-0000-4000-8000-000000000001","parent_temp_id":null,"name":"Pasted","description":null,"position":0}]'::jsonb,
  '[{"box_temp_id":"f2100000-0000-4000-8000-000000000001","name":"Pasted item","position":0,"photos":[],"tag_ids":[]}]'::jsonb,
  '[{"box_temp_id":"f2100000-0000-4000-8000-000000000001","name":"Pasted wish","position":0,"photos":[],"tag_ids":[]}]'::jsonb
);
SELECT pg_temp.assert_true((
  SELECT collection_visibility='private' AND wishlist_visibility='private'
  FROM public.boxes
  WHERE user_id='f1000000-0000-4000-8000-000000000001' AND name='Pasted'
), 'box paste inherits destination, rejecting a wider tree');
INSERT INTO public.items(user_id,name,is_wishlist,wishlist_target_box_id)
 VALUES ('f1000000-0000-4000-8000-000000000001','Imported',true,'f2000000-0000-4000-8000-000000000004');
SELECT pg_temp.assert_true(NOT sharing_private.wishlist_item_is_visible(
  (SELECT id FROM public.items WHERE name='Imported' AND user_id='f1000000-0000-4000-8000-000000000001'),
  NULL
), 'import into a private wishlist target stays unpublished');

RESET ROLE;
ROLLBACK;

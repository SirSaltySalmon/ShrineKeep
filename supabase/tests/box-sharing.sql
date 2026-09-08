BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
 ('71000000-0000-4000-8000-000000000001','sharing@test.invalid','{"username":"sharing-owner"}'),
 ('71000000-0000-4000-8000-000000000002','other@test.invalid','{"username":"sharing-other"}');
INSERT INTO public.boxes (id,user_id,parent_box_id,name) VALUES
 ('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',NULL,'Parent'),
 ('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','Child'),
 ('72000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002','Grandchild');
INSERT INTO public.items (user_id,name,is_wishlist,wishlist_target_box_id) VALUES
 ('71000000-0000-4000-8000-000000000001','Secret wish',true,'72000000-0000-4000-8000-000000000003');
UPDATE public.user_settings SET root_collection_visibility='public', root_wishlist_visibility='public'
 WHERE user_id='71000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := '71000000-0000-4000-8000-000000000001'; box uuid := '72000000-0000-4000-8000-000000000001';
  child uuid := '72000000-0000-4000-8000-000000000002'; grandchild uuid := '72000000-0000-4000-8000-000000000003';
  result jsonb; preview jsonb; base_revision bigint;
BEGIN
  SELECT sharing_revision INTO base_revision FROM public.users WHERE id = actor;
  result := public.sharing_preview_box(actor,box);
  PERFORM pg_temp.assert_true(result->'data'->>'descendantCount' = '2','all descendants counted');
  PERFORM pg_temp.assert_true((SELECT sharing_revision = base_revision FROM public.users WHERE id = actor),'preview makes no write');
  result := public.sharing_update_box(actor,box,'public',false,'public',false,base_revision,2);
  PERFORM pg_temp.assert_true((result->>'ok')::boolean,'parent opened');
  UPDATE public.boxes SET collection_visibility='public', wishlist_visibility='public' WHERE id IN (child, grandchild);
  SELECT sharing_revision INTO base_revision FROM public.users WHERE id = actor;
  preview := public.sharing_preview_box(actor,box,'friends',false,'friends',false);
  PERFORM pg_temp.assert_true((preview->'data'->>'affectedCount')::bigint = 3,'restrict preview matches rows that will change');
  result := public.sharing_update_box(actor,box,'friends',false,'friends',false,base_revision,2);
  PERFORM pg_temp.assert_true((SELECT bool_and(collection_visibility = 'friends' AND wishlist_visibility = 'friends' AND NOT share_financials) FROM public.boxes WHERE user_id = actor AND id IN (box, child, grandchild)),'restrict clamps wider descendants');
  result := public.sharing_update_box(actor,box,'public',true,'private',true,base_revision,2);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'revision_conflict','stale save denied');
  result := public.sharing_update_box(actor,box,'public',true,'private',true,(SELECT sharing_revision FROM public.users WHERE id = actor),1);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'revision_conflict','changed count denied');
  SELECT sharing_revision INTO base_revision FROM public.users WHERE id = actor;
  result := public.sharing_update_box(actor,box,'public',true,'public',false,base_revision,2);
  PERFORM pg_temp.assert_true((result->>'ok')::boolean,'single box save');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.boxes WHERE user_id = actor AND collection_visibility = 'public'),'widening preserves descendant overrides');
  result := public.sharing_preview_box('71000000-0000-4000-8000-000000000002',box);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'not_found','other owner denied');
  BEGIN
    UPDATE public.boxes SET parent_box_id = '72000000-0000-4000-8000-000000000003' WHERE id = box;
    RAISE EXCEPTION 'cycle allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.sharing_preview_box('71000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'client forged actor';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;

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
INSERT INTO public.items (user_id,name,is_wishlist,wishlist_is_private,wishlist_target_box_id) VALUES
 ('71000000-0000-4000-8000-000000000001','Secret wish',true,true,'72000000-0000-4000-8000-000000000003');
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid := '71000000-0000-4000-8000-000000000001'; box uuid := '72000000-0000-4000-8000-000000000001'; result jsonb; base_revision bigint;
BEGIN
  SELECT sharing_revision INTO base_revision FROM public.users WHERE id = actor;
  result := public.sharing_preview_box(actor,box);
  PERFORM pg_temp.assert_true(result->'data'->>'descendantCount' = '2','all descendants counted');
  PERFORM pg_temp.assert_true((SELECT sharing_revision = base_revision FROM public.users WHERE id = actor),'preview makes no write');
  result := public.sharing_update_box(actor,box,'private',false,'public',true,base_revision,2);
  PERFORM pg_temp.assert_true(result->'data'->>'revision' = (base_revision+1)::text,'successful save advances revision once');
  PERFORM pg_temp.assert_true((SELECT bool_and(collection_visibility = 'private' AND wishlist_visibility = 'public' AND NOT share_financials) FROM public.boxes WHERE user_id = actor),'independent settings propagate');
  PERFORM pg_temp.assert_true((SELECT bool_and(wishlist_is_private) FROM public.items WHERE user_id = actor),'propagation never clears explicit private');
  result := public.sharing_update_box(actor,box,'public',true,'private',true,base_revision,2);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'revision_conflict','stale save denied');
  result := public.sharing_update_box(actor,box,'public',true,'private',true,base_revision+1,1);
  PERFORM pg_temp.assert_true(result->'error'->>'code' = 'revision_conflict','changed count denied');
  result := public.sharing_update_box(actor,box,'public',true,'friends',false,base_revision+1,2);
  PERFORM pg_temp.assert_true(result->'data'->>'revision' = (base_revision+2)::text,'single box save');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM public.boxes WHERE user_id = actor AND collection_visibility = 'public'),'descendant overrides preserved when unchecked');
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

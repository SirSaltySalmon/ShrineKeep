BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('b1000000-0000-4000-8000-000000000001','item-owner@test.invalid','{"username":"item-owner"}'),
 ('b1000000-0000-4000-8000-000000000002','item-other@test.invalid','{"username":"item-other"}');
INSERT INTO public.boxes(id,user_id,name) VALUES
 ('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Private target'),
 ('b2000000-0000-4000-8000-000000000002','b1000000-0000-4000-8000-000000000001','Public target'),
 ('b2000000-0000-4000-8000-000000000003','b1000000-0000-4000-8000-000000000002','Other target');
UPDATE public.user_settings SET root_wishlist_visibility='public' WHERE user_id='b1000000-0000-4000-8000-000000000001';
UPDATE public.boxes SET wishlist_visibility='public' WHERE id='b2000000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='b1000000-0000-4000-8000-000000000001';
INSERT INTO public.items(id,user_id,name,is_wishlist,wishlist_target_box_id) VALUES
 ('b3000000-0000-4000-8000-000000000001',auth.uid(),'Wish',true,'b2000000-0000-4000-8000-000000000001'),
 ('b3000000-0000-4000-8000-000000000002',auth.uid(),'Survivor',true,'b2000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  BEGIN
    UPDATE public.items SET wishlist_target_box_id='b2000000-0000-4000-8000-000000000002' WHERE id='b3000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'broadening allowed' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'privacy_conflict' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.items SET box_id='b2000000-0000-4000-8000-000000000003' WHERE id='b3000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'cross-owner collection allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.items SET wishlist_target_box_id='b2000000-0000-4000-8000-000000000003' WHERE id='b3000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'cross-owner wishlist allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE public.items SET wishlist_is_private=true,wishlist_target_box_id='b2000000-0000-4000-8000-000000000002' WHERE id='b3000000-0000-4000-8000-000000000001';
UPDATE public.items SET is_wishlist=false,wishlist_target_box_id=NULL,wishlist_is_private=false WHERE id='b3000000-0000-4000-8000-000000000001';
UPDATE public.items SET is_wishlist=true,wishlist_target_box_id='b2000000-0000-4000-8000-000000000002',wishlist_is_private=false WHERE id='b3000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT wishlist_is_private FROM public.items WHERE id='b3000000-0000-4000-8000-000000000001'),'private survives conversions');
DELETE FROM public.boxes WHERE id='b2000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true((SELECT wishlist_target_box_id IS NULL AND wishlist_detached_visibility='private' FROM public.items WHERE id='b3000000-0000-4000-8000-000000000002'),'deleted private target preserves audience');
DO $$ BEGIN
  BEGIN
    UPDATE public.items SET wishlist_detached_visibility='public' WHERE id='b3000000-0000-4000-8000-000000000002';
    RAISE EXCEPTION 'detached metadata forge allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.assert_true(NOT sharing_private.wishlist_item_is_visible('b3000000-0000-4000-8000-000000000002',NULL),'detached item hidden under public root');
RESET ROLE;
ROLLBACK;

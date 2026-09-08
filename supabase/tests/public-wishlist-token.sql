BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('d1000000-0000-4000-8000-000000000001','token-owner@test.invalid','{"username":"token-owner"}'),
 ('d1000000-0000-4000-8000-000000000002','token-friend@test.invalid','{"username":"token-friend"}'),
 ('d1000000-0000-4000-8000-000000000003','token-blocked@test.invalid','{"username":"token-blocked"}');
INSERT INTO public.social_friendships(user_low,user_high,requested_by,status,accepted_at) VALUES
 ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','accepted',now());
INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES
 ('d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003');
INSERT INTO public.boxes(id,user_id,name) VALUES
 ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','friends box');
UPDATE public.boxes SET wishlist_visibility='friends' WHERE id='d2000000-0000-4000-8000-000000000001';
INSERT INTO public.items(id,user_id,is_wishlist,wishlist_target_box_id,name,expected_price) VALUES
 ('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',true,NULL,'root public wish',0),
 ('d3000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',true,'d2000000-0000-4000-8000-000000000001','friends wish',1);
UPDATE public.user_settings SET
  wishlist_share_token='d4000000-0000-4000-8000-000000000001',
  wishlist_is_public=false,
  root_wishlist_visibility='public'
 WHERE user_id='d1000000-0000-4000-8000-000000000001';
SET LOCAL ROLE service_role;
DO $$
DECLARE owner_id uuid := 'd1000000-0000-4000-8000-000000000001';
 token text := 'd4000000-0000-4000-8000-000000000001';
 resolved jsonb; page jsonb;
BEGIN
 resolved := public.sharing_resolve_wishlist_token(token,NULL);
 PERFORM pg_temp.assert_true(resolved->'data'->>'ownerId'=owner_id::text,'token aliases owner');
 PERFORM pg_temp.assert_true(position(token IN resolved::text)=0,'token omitted from payload');
 page := public.sharing_read_page((resolved->'data'->>'ownerId')::uuid,NULL,'wishlist');
 PERFORM pg_temp.assert_true(jsonb_array_length(page->'data'->'rows')=1 AND page->'data'->'rows'->0->'item'->>'name'='root public wish','token is not a friends grant');
 page := public.sharing_read_page(owner_id,'d1000000-0000-4000-8000-000000000002','wishlist');
 PERFORM pg_temp.assert_true(jsonb_array_length(page->'data'->'rows')=2,'friend still sees friends wish via uuid');
 PERFORM pg_temp.assert_true(public.sharing_resolve_wishlist_token(token,'d1000000-0000-4000-8000-000000000003')->'error'->>'code'='not_found','blocked token denied');
 PERFORM pg_temp.assert_true(public.sharing_resolve_wishlist_token('missing-token',NULL)->'error'->>'code'='not_found','unknown token denied');
 PERFORM pg_temp.assert_true(public.sharing_resolve_wishlist_token('bad token!',NULL)->'error'->>'code'='invalid_input','malformed token denied');
 UPDATE public.users SET public_access_disabled_at=now() WHERE id=owner_id;
 PERFORM pg_temp.assert_true(public.sharing_resolve_wishlist_token(token,NULL)->'error'->>'code'='not_found','unpublished owner denied');
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.sharing_resolve_wishlist_token('d4000000-0000-4000-8000-000000000001',NULL);
  RAISE EXCEPTION 'client bypassed token resolver';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;

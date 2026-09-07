BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
 ('41000000-0000-4000-8000-000000000001','public-owner@test.invalid','{"username":"public-owner","name":"SECRET PROVIDER NAME"}'),
 ('41000000-0000-4000-8000-000000000002','public-friend@test.invalid','{"username":"public-friend"}'),
 ('41000000-0000-4000-8000-000000000003','public-blocked@test.invalid','{"username":"public-blocked"}');
INSERT INTO public.social_friendships (user_low,user_high,requested_by,status,accepted_at) VALUES
 ('41000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','accepted',now());
INSERT INTO public.user_blocks (blocker_id,blocked_id) VALUES
 ('41000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000001');
INSERT INTO public.boxes (id,user_id,parent_box_id,name,collection_visibility,wishlist_visibility) VALUES
 ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',NULL,'A','public','public'),
 ('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','SECRET B','private','public'),
 ('42000000-0000-4000-8000-000000000003','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000002','C','public','friends'),
 ('42000000-0000-4000-8000-000000000004','41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000003','D','friends','private');
-- Creation always inherits; explicit owner publication follows creation.
UPDATE public.boxes SET collection_visibility = CASE name WHEN 'SECRET B' THEN 'private'::public.sharing_audience WHEN 'D' THEN 'friends'::public.sharing_audience ELSE 'public'::public.sharing_audience END,
  wishlist_visibility = CASE name WHEN 'C' THEN 'friends'::public.sharing_audience WHEN 'D' THEN 'private'::public.sharing_audience ELSE 'public'::public.sharing_audience END;
INSERT INTO public.boxes (user_id,parent_box_id,name,collection_visibility)
 SELECT '41000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','visible child ' || n,'public' FROM generate_series(1,25) n;
INSERT INTO public.items (user_id,name,box_id,current_value,acquisition_price,acquisition_date) VALUES
 ('41000000-0000-4000-8000-000000000001','Owned','42000000-0000-4000-8000-000000000001',999,888,'2020-01-01');
INSERT INTO public.items (id,user_id,name,is_wishlist,wishlist_target_box_id,current_value,acquisition_price,expected_price,thumbnail_url,created_at)
 SELECT ('43000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,'41000000-0000-4000-8000-000000000001','Wish ' || n,true,
 '42000000-0000-4000-8000-000000000002',999,888,0,'https://secret.invalid/media','2026-01-01 00:00:00.123456+00' FROM generate_series(1,25) n;

SET LOCAL ROLE service_role;
DO $$
DECLARE owner_id uuid := '41000000-0000-4000-8000-000000000001'; response jsonb; next_page jsonb;
BEGIN
  response := public.sharing_read_context(owner_id,NULL);
  PERFORM pg_temp.assert_true(response->'data'->'profile'->>'nickname' = 'Collector-00000001','neutral profile');
  PERFORM pg_temp.assert_true(response::text NOT LIKE '%SECRET%' AND response::text NOT LIKE '%email%', 'identity allowlist');
  response := public.sharing_read_page(owner_id,NULL,'boxes');
  PERFORM pg_temp.assert_true(jsonb_array_length(response->'data'->'rows') = 2,'root grouping before pagination');
  PERFORM pg_temp.assert_true(response->'data'->'rows'->1->'item'->>'name' = 'C','private gap detached root');
  PERFORM pg_temp.assert_true(response->'data'->'rows'->1->'item'->'displayParentId' = 'null'::jsonb,'no hidden parent');
  PERFORM pg_temp.assert_true(response::text NOT LIKE '%SECRET B%', 'no hidden title');
  response := public.sharing_read_page(owner_id,NULL,'boxes','42000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(jsonb_array_length(response->'data'->'rows') = 21,'bounded direct children');
  response := public.sharing_read_page(owner_id,NULL,'items','42000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(response->'data'->'rows'->0->'item'->'currentValue' = 'null'::jsonb AND response->'data'->'rows'->0->'item'->'acquisitionDate' = 'null'::jsonb,'finance masking');
  UPDATE public.boxes SET share_financials = true WHERE id = '42000000-0000-4000-8000-000000000001';
  UPDATE public.items SET current_value = 0 WHERE NOT is_wishlist;
  response := public.sharing_read_page(owner_id,NULL,'items','42000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assert_true(response->'data'->'rows'->0->'item'->>'currentValue' = '0.00','real zero preserved');
  response := public.sharing_read_page(owner_id,NULL,'wishlist');
  PERFORM pg_temp.assert_true(jsonb_array_length(response->'data'->'rows') = 21,'bounded wishlist');
  PERFORM pg_temp.assert_true(response->'data'->'rows'->0->'item'->'visibleTarget' = 'null'::jsonb,'private target omitted');
  PERFORM pg_temp.assert_true(response::text NOT LIKE '%secret.invalid%' AND response::text NOT LIKE '%999%' AND response::text NOT LIKE '%acquisition%','wishlist allowlist');
  PERFORM pg_temp.assert_true(response->'data'->'rows'->0->'item'->>'expectedPrice' = '0.00','wishlist expected price independent');
  next_page := public.sharing_read_page(owner_id,NULL,'wishlist',NULL,response->'data'->'rows'->19->'key');
  PERFORM pg_temp.assert_true(jsonb_array_length(next_page->'data'->'rows') = 5,'keyset next page on duplicate timestamps');
  PERFORM pg_temp.assert_true(next_page->'data'->'rows'->0->'item'->>'id' = response->'data'->'rows'->20->'item'->>'id','no duplicate or missing boundary row');
  response := public.sharing_read_page(owner_id,NULL,'boxes','42000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'not_found','hidden parent denied');
  response := public.sharing_read_page(owner_id,'41000000-0000-4000-8000-000000000003','wishlist');
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'not_found','signed-in block denied');
  response := public.sharing_read_page(owner_id,NULL,'wishlist',NULL,NULL,999);
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'cursor_reset','stale revision denied');
  response := public.sharing_read_page(owner_id,NULL,'boxes',NULL,'{"id":"bad","value":"bad"}');
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'invalid_input','malformed key denied');
  response := public.sharing_read_page(owner_id,NULL,'boxes',NULL,'{"id":null,"value":null}');
  PERFORM pg_temp.assert_true(response->'error'->>'code' = 'invalid_input','null key denied');
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.sharing_read_context('41000000-0000-4000-8000-000000000001',NULL);
    RAISE EXCEPTION 'anon called service-only read';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;

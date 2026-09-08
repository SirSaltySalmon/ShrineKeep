BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('a1000000-0000-4000-8000-000000000001','detail-owner@test.invalid','{"username":"detail-owner"}'),
 ('a1000000-0000-4000-8000-000000000002','detail-friend@test.invalid','{"username":"detail-friend"}'),
 ('a1000000-0000-4000-8000-000000000003','detail-other@test.invalid','{"username":"detail-other"}');
INSERT INTO public.boxes(id,user_id,name) VALUES
 ('a2000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','public box'),
 ('a2000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','PRIVATE target');
UPDATE public.boxes SET collection_visibility='public' WHERE id='a2000000-0000-4000-8000-000000000001';
UPDATE public.boxes SET wishlist_visibility='public' WHERE id='a2000000-0000-4000-8000-000000000002';
INSERT INTO public.items(id,user_id,box_id,name,current_value,acquisition_price,acquisition_date) VALUES
 ('a3000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','Owned',0,123,'2026-01-01');
INSERT INTO public.items(id,user_id,is_wishlist,wishlist_target_box_id,name,expected_price) VALUES
 ('a3000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001',true,'a2000000-0000-4000-8000-000000000002','Wish',0);
INSERT INTO public.photos(id,item_id,url,is_thumbnail,uploaded_at)
 SELECT ('a4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'a3000000-0000-4000-8000-000000000001',
  'https://cdn.example.test/PRIVATE-path-'||n||'.jpg',n=2,'2026-01-01T00:00:00.123456Z' FROM generate_series(1,23)n;
INSERT INTO public.tags(id,user_id,name,color)
 SELECT ('a5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'a1000000-0000-4000-8000-000000000001','Tag '||n,'blue' FROM generate_series(1,23)n;
INSERT INTO public.tags(id,user_id,name,color) VALUES('a5000000-0000-4000-8000-000000000099','a1000000-0000-4000-8000-000000000003','PRIVATE foreign tag','red');
INSERT INTO public.item_tags(item_id,tag_id) SELECT 'a3000000-0000-4000-8000-000000000001',id FROM public.tags WHERE id::text LIKE 'a5000000-%';
INSERT INTO public.social_friendships(user_low,user_high,requested_by,status,accepted_at) VALUES
 ('a1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','accepted',now());
SET LOCAL ROLE service_role;
DO $$
DECLARE owner_id uuid := 'a1000000-0000-4000-8000-000000000001';
 item_id uuid := 'a3000000-0000-4000-8000-000000000001';
 wish_id uuid := 'a3000000-0000-4000-8000-000000000002';
 response jsonb; photo_key jsonb; tag_key jsonb; rev bigint;
BEGIN
 response := public.sharing_read_item_detail(owner_id,NULL,item_id,'items');
 PERFORM pg_temp.assert_true((response->>'ok')::boolean,'guest collection detail');
 PERFORM pg_temp.assert_true(response->'data'->'item'->'currentValue'='null'::jsonb AND response->'data'->'item'->'acquisitionPrice'='null'::jsonb,'hidden finances masked');
 PERFORM pg_temp.assert_true(response->'data'->'item'->>'thumbnailReferenceId'='a4000000-0000-4000-8000-000000000002','explicit thumbnail wins');
 PERFORM pg_temp.assert_true(jsonb_array_length(response->'data'->'photos')=21 AND jsonb_array_length(response->'data'->'tags')=21,'bounded lookahead');
 PERFORM pg_temp.assert_true(position('PRIVATE' IN response::text)=0,'no paths or foreign tags');
 photo_key := response->'data'->'photos'->19->'key'; tag_key := response->'data'->'tags'->19->'key';
 response := public.sharing_read_item_detail(owner_id,NULL,item_id,'items',photo_key,tag_key);
 PERFORM pg_temp.assert_true(jsonb_array_length(response->'data'->'photos')=3 AND jsonb_array_length(response->'data'->'tags')=3,'independent keyset tails');
 PERFORM pg_temp.assert_true(response->'data'->'photos'->0->>'referenceId'='a4000000-0000-4000-8000-000000000021','timestamp precision and UUID tie-breaker');
 response := public.sharing_read_item_detail(owner_id,NULL,item_id,'items',NULL,'{"id":"a5000000-0000-4000-8000-000000000001","value":"bad"}');
 PERFORM pg_temp.assert_true(response->'error'->>'code'='invalid_input','malformed tag key rejected');
 response := public.sharing_read_item_detail(owner_id,NULL,item_id,'items','{"id":null,"value":null}',NULL);
 PERFORM pg_temp.assert_true(response->'error'->>'code'='invalid_input','null photo key rejected');
 response := public.sharing_read_item_detail(owner_id,NULL,wish_id,'wishlist');
 PERFORM pg_temp.assert_true((response->'data'->'item'->>'expectedPrice')::numeric=0 AND response->'data'->'item'->'visibleTarget'='null'::jsonb,'independent wishlist with zero price and hidden target');
 PERFORM pg_temp.assert_true(NOT (response->'data'->'item' ? 'acquisitionPrice'),'wishlist omits acquired fields');
 PERFORM pg_temp.assert_true(public.sharing_read_item_detail(owner_id,NULL,wish_id,'items')->'error'->>'code'='not_found','wrong surface denied');
 PERFORM pg_temp.assert_true(public.sharing_read_item_detail('a1000000-0000-4000-8000-000000000003',NULL,item_id,'items')->'error'->>'code'='not_found','wrong owner denied');
 UPDATE public.boxes SET share_financials=true WHERE id='a2000000-0000-4000-8000-000000000001';
 response := public.sharing_read_item_detail(owner_id,NULL,item_id,'items');
 PERFORM pg_temp.assert_true((response->'data'->'item'->>'currentValue')::numeric=0 AND (response->'data'->'item'->>'acquisitionPrice')::numeric=123,'financial consent preserves zero');
 rev := (response->'data'->>'revision')::bigint;
 UPDATE public.boxes SET collection_visibility='friends' WHERE id='a2000000-0000-4000-8000-000000000001';
 PERFORM pg_temp.assert_true(public.sharing_read_item_detail(owner_id,NULL,item_id,'items',NULL,NULL,rev)->'error'->>'code'='cursor_reset','revision rechecked');
 PERFORM pg_temp.assert_true(public.sharing_read_item_detail(owner_id,NULL,item_id,'items')->'error'->>'code'='not_found','guest denied friends item');
 PERFORM pg_temp.assert_true((public.sharing_read_item_detail(owner_id,'a1000000-0000-4000-8000-000000000002',item_id,'items')->>'ok')::boolean,'friend allowed');
 UPDATE public.items SET wishlist_is_private=true WHERE id=wish_id;
 PERFORM pg_temp.assert_true(public.sharing_read_item_detail(owner_id,NULL,wish_id,'wishlist')->'error'->>'code'='not_found','explicit private veto');
 INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES(owner_id,'a1000000-0000-4000-8000-000000000002');
 PERFORM pg_temp.assert_true(public.sharing_read_item_detail(owner_id,'a1000000-0000-4000-8000-000000000002',item_id,'items')->'error'->>'code'='not_found','block denies friend details');
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.sharing_read_item_detail('a1000000-0000-4000-8000-000000000001',NULL,'a3000000-0000-4000-8000-000000000001','items');
  RAISE EXCEPTION 'client bypassed detail service';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;

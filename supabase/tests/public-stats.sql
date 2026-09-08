BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('e1000000-0000-4000-8000-000000000001','stats-owner@test.invalid','{"username":"stats-owner"}'),
 ('e1000000-0000-4000-8000-000000000002','stats-blocked@test.invalid','{"username":"stats-blocked"}');
INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES
 ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002');
INSERT INTO public.boxes(id,user_id,parent_box_id,name) VALUES
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',NULL,'A'),
 ('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','B'),
 ('e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','C'),
 ('e2000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001',NULL,'P'),
 ('e2000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000004','Q'),
 ('e2000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000001',NULL,'Z');
UPDATE public.boxes SET collection_visibility='public',share_financials=true WHERE id IN
 ('e2000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000003','e2000000-0000-4000-8000-000000000005','e2000000-0000-4000-8000-000000000006');
UPDATE public.boxes SET collection_visibility='private',share_financials=true WHERE id='e2000000-0000-4000-8000-000000000002';
UPDATE public.boxes SET collection_visibility='public',share_financials=false WHERE id='e2000000-0000-4000-8000-000000000004';
INSERT INTO public.items(id,user_id,box_id,name,current_value,acquisition_price,acquisition_date) VALUES
 ('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','A item',10,10,'2020-01-01'),
 ('e3000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000002','B hidden',123.45,123.45,'2020-01-01'),
 ('e3000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000003','C item',1,1,'2021-06-01'),
 ('e3000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000004','P hidden finance',4,4,'2020-01-01'),
 ('e3000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000005','Q shared child',7,7,'2020-01-01'),
 ('e3000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000006','Zero box',0,0,'2024-01-01'),
 ('e3000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000001',NULL,'Unboxed',50,50,'2020-01-01');
INSERT INTO public.items(id,user_id,is_wishlist,name,expected_price) VALUES
 ('e3000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000001',true,'Wish',999);
INSERT INTO public.value_history(item_id,value,recorded_at) VALUES
 ('e3000000-0000-4000-8000-000000000001',8,'2024-06-01 12:00:00+00');
SET LOCAL ROLE service_role;
DO $$
DECLARE owner_id uuid := 'e1000000-0000-4000-8000-000000000001';
  box_a uuid := 'e2000000-0000-4000-8000-000000000001';
  box_b uuid := 'e2000000-0000-4000-8000-000000000002';
  box_c uuid := 'e2000000-0000-4000-8000-000000000003';
  box_p uuid := 'e2000000-0000-4000-8000-000000000004';
  box_q uuid := 'e2000000-0000-4000-8000-000000000005';
  box_z uuid := 'e2000000-0000-4000-8000-000000000006';
  guest_a jsonb; guest_c jsonb; profile jsonb; parent jsonb; zeros jsonb;
  windowed jsonb; months jsonb;
BEGIN
  guest_a := public.sharing_read_stats(owner_id,NULL,box_a,'2024-01-01','2024-01-03');
  PERFORM pg_temp.assert_true((guest_a->'data'->>'currentValue')::numeric = 10,'guest A totals A only');
  PERFORM pg_temp.assert_true((guest_a->'data'->>'totalAcquisition')::numeric = 10,'guest A acquisition');
  PERFORM pg_temp.assert_true(guest_a::text NOT LIKE '%123.45%','private gap amount omitted');
  PERFORM pg_temp.assert_true((guest_a->'data'->'acquisitionHistory'->0->>'cumulativeAcquisition')::numeric = 10,'opening cumulative before window');
  PERFORM pg_temp.assert_true(guest_a->'data'->>'bucket' = 'day','short window uses day');
  PERFORM pg_temp.assert_true(jsonb_array_length(guest_a->'data'->'valueHistory') = 3,'dense day buckets');
  PERFORM pg_temp.assert_true((guest_a->'data'->'valueHistory'->0->>'value')::numeric = 0,'pre-history as-of is zero, not current');

  guest_c := public.sharing_read_stats(owner_id,NULL,box_c);
  PERFORM pg_temp.assert_true((guest_c->'data'->>'currentValue')::numeric = 1,'detached grandchild is its own root');
  PERFORM pg_temp.assert_true(public.sharing_read_stats(owner_id,NULL,box_b)->'error'->>'code' = 'not_found','hidden box denied');

  profile := public.sharing_read_stats(owner_id,NULL,NULL,'2024-01-01','2024-01-01');
  PERFORM pg_temp.assert_true((profile->'data'->>'currentValue')::numeric = 18,'profile roots A+C+Q once');
  PERFORM pg_temp.assert_true((profile->'data'->>'totalAcquisition')::numeric = 18,'unboxed owned items excluded from totals');
  PERFORM pg_temp.assert_true(profile::text NOT LIKE '%123.45%' AND profile::text NOT LIKE '%999%','hidden and wishlist omitted');

  parent := public.sharing_read_stats(owner_id,NULL,box_p);
  PERFORM pg_temp.assert_true((parent->'data'->>'currentValue')::numeric = 7,'parent totals visible child finances');
  PERFORM pg_temp.assert_true((public.sharing_read_stats(owner_id,NULL,box_q)->'data'->>'currentValue')::numeric = 7,'child box is its own finances');

  zeros := public.sharing_read_stats(owner_id,NULL,box_z,'2024-01-01','2024-01-01');
  PERFORM pg_temp.assert_true((zeros->'data'->>'currentValue')::numeric = 0 AND (zeros->'data'->>'totalAcquisition')::numeric = 0,'real zeros preserved');

  windowed := public.sharing_read_stats(owner_id,NULL,box_a,'2024-06-01','2024-06-02');
  PERFORM pg_temp.assert_true((windowed->'data'->>'currentValue')::numeric = 10,'window does not change totals');
  PERFORM pg_temp.assert_true((windowed->'data'->'valueHistory'->0->>'value')::numeric = 8,'history as-of uses UTC date');

  months := public.sharing_read_stats(owner_id,NULL,box_a,'2024-01-01','2025-02-04');
  PERFORM pg_temp.assert_true(months->'data'->>'bucket' = 'month','400-day window uses month');
  PERFORM pg_temp.assert_true(jsonb_array_length(months->'data'->'valueHistory') BETWEEN 1 AND 366,'bounded month series');
  PERFORM pg_temp.assert_true(jsonb_array_length(months->'data'->'valueHistory') = jsonb_array_length(months->'data'->'acquisitionHistory'),'paired series');

  PERFORM pg_temp.assert_true(public.sharing_read_stats(owner_id,NULL,box_a,'2025-01-02','2025-01-01')->'error'->>'code' = 'invalid_input','from after to denied');
  PERFORM pg_temp.assert_true(public.sharing_read_stats(owner_id,'e1000000-0000-4000-8000-000000000002',NULL)->'error'->>'code' = 'not_found','blocked viewer denied');
  PERFORM pg_temp.assert_true(position('e3000000' IN profile::text) = 0,'item ids omitted');
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.sharing_read_stats('e1000000-0000-4000-8000-000000000001',NULL);
    RAISE EXCEPTION 'client bypassed stats';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;

BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;

CREATE FUNCTION pg_temp.assert_fails(stmt text, state text, label text, msg_like text DEFAULT '%') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> state OR SQLERRM NOT LIKE msg_like THEN
      RAISE EXCEPTION 'Assertion failed: % (got % %)', label, SQLSTATE, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'Assertion failed: % (statement succeeded)', label;
END $$;

-- 1 free at cap, 2 free at cap-1, 3 grandfathered to 150, 4 Pro.
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('9c100000-0000-4000-8000-000000000001','cap-free@test.invalid','{"username":"cap-free"}'),
 ('9c100000-0000-4000-8000-000000000002','cap-edge@test.invalid','{"username":"cap-edge"}'),
 ('9c100000-0000-4000-8000-000000000003','cap-grandfathered@test.invalid','{"username":"cap-grandfathered"}'),
 ('9c100000-0000-4000-8000-000000000004','cap-pro@test.invalid','{"username":"cap-pro"}');
UPDATE public.users SET grandfathered_item_count=150 WHERE id='9c100000-0000-4000-8000-000000000003';
INSERT INTO public.subscriptions(user_id,stripe_customer_id,status,current_period_end) VALUES
 ('9c100000-0000-4000-8000-000000000004','cus_cap_pro','active',now()+interval '20 days');
INSERT INTO public.boxes(id,user_id,name) SELECT
 ('9c200000-0000-4000-8000-00000000000'||n)::uuid,('9c100000-0000-4000-8000-00000000000'||n)::uuid,'box'
 FROM generate_series(1,4) n;
-- Seeded as postgres: the trigger lets privileged roles through.
INSERT INTO public.items(user_id,box_id,name,is_wishlist)
SELECT ('9c100000-0000-4000-8000-00000000000'||n)::uuid,('9c200000-0000-4000-8000-00000000000'||n)::uuid,'seed '||g,false
FROM generate_series(1,4) n, generate_series(1,100) g
WHERE NOT (n=2 AND g=100);
INSERT INTO public.items(id,user_id,name,is_wishlist) VALUES
 ('9c300000-0000-4000-8000-000000000001','9c100000-0000-4000-8000-000000000001','wish',true);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '9c100000-0000-4000-8000-000000000001';

SELECT pg_temp.assert_fails(
  $q$UPDATE public.users SET grandfathered_item_count=999999 WHERE id='9c100000-0000-4000-8000-000000000001'$q$,
  '42501', 'owner cannot raise own grandfathered cap');
SELECT pg_temp.assert_fails(
  $q$UPDATE public.users SET email='victim@test.invalid' WHERE id='9c100000-0000-4000-8000-000000000001'$q$,
  '42501', 'owner cannot squat an email');
SELECT pg_temp.assert_fails(
  $q$UPDATE public.users SET username='someone-else' WHERE id='9c100000-0000-4000-8000-000000000001'$q$,
  '42501', 'owner cannot change username');
UPDATE public.users SET name='Renamed', avatar_url=NULL, updated_at=now()
 WHERE id='9c100000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT name FROM public.users WHERE id='9c100000-0000-4000-8000-000000000001')='Renamed',
  'owner can still edit name/avatar_url/updated_at');

SELECT pg_temp.assert_fails(
  $q$INSERT INTO public.items(user_id,box_id,name,is_wishlist) VALUES
     ('9c100000-0000-4000-8000-000000000001','9c200000-0000-4000-8000-000000000001','over',false)$q$,
  'P0001', 'direct insert over cap rejected', 'item_limit_reached:100:100');
INSERT INTO public.items(user_id,name,is_wishlist) VALUES
 ('9c100000-0000-4000-8000-000000000001','another wish',true);
SELECT pg_temp.assert_fails(
  $q$UPDATE public.items SET is_wishlist=false, box_id='9c200000-0000-4000-8000-000000000001'
     WHERE id='9c300000-0000-4000-8000-000000000001'$q$,
  'P0001', 'wishlist -> collection flip over cap rejected', 'item_limit_reached:%');
UPDATE public.items SET name='renamed seed'
 WHERE user_id='9c100000-0000-4000-8000-000000000001' AND name='seed 1';
SELECT pg_temp.assert_fails(
  $q$SELECT public.paste_box_trees_atomic(
     '9c100000-0000-4000-8000-000000000001', NULL, NULL,
     '[{"temp_id":"9c400000-0000-4000-8000-000000000001","name":"pasted"}]',
     '[{"box_temp_id":"9c400000-0000-4000-8000-000000000001","name":"pasted item"}]',
     '[]')$q$,
  'P0001', 'paste with p_cap NULL still capped', 'item_limit_reached:%');
SELECT public.paste_box_trees_atomic(
  '9c100000-0000-4000-8000-000000000001', NULL, NULL,
  '[{"temp_id":"9c400000-0000-4000-8000-000000000002","name":"wish only"}]',
  '[]',
  '[{"box_temp_id":"9c400000-0000-4000-8000-000000000002","name":"pasted wish"}]');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT pg_temp.assert_fails(
  $q$UPDATE public.users SET name='anon' WHERE id='9c100000-0000-4000-8000-000000000001'$q$,
  '42501', 'anon has no users UPDATE grant');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '9c100000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_fails(
  $q$INSERT INTO public.items(user_id,box_id,name,is_wishlist) VALUES
     ('9c100000-0000-4000-8000-000000000002','9c200000-0000-4000-8000-000000000002','a',false),
     ('9c100000-0000-4000-8000-000000000002','9c200000-0000-4000-8000-000000000002','b',false)$q$,
  'P0001', 'multi-row insert crossing the cap rejected', 'item_limit_reached:100:100');
INSERT INTO public.items(user_id,box_id,name,is_wishlist) VALUES
 ('9c100000-0000-4000-8000-000000000002','9c200000-0000-4000-8000-000000000002','last slot',false);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '9c100000-0000-4000-8000-000000000003';
INSERT INTO public.items(user_id,box_id,name,is_wishlist) VALUES
 ('9c100000-0000-4000-8000-000000000003','9c200000-0000-4000-8000-000000000003','grandfathered extra',false);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '9c100000-0000-4000-8000-000000000004';
INSERT INTO public.items(user_id,box_id,name,is_wishlist) VALUES
 ('9c100000-0000-4000-8000-000000000004','9c200000-0000-4000-8000-000000000004','pro extra',false);
RESET ROLE;

UPDATE public.subscriptions SET status='past_due', current_period_end=now()-interval '3 days'
 WHERE user_id='9c100000-0000-4000-8000-000000000004';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '9c100000-0000-4000-8000-000000000004';
INSERT INTO public.items(user_id,box_id,name,is_wishlist) VALUES
 ('9c100000-0000-4000-8000-000000000004','9c200000-0000-4000-8000-000000000004','grace extra',false);
RESET ROLE;

UPDATE public.subscriptions SET current_period_end=now()-interval '8 days'
 WHERE user_id='9c100000-0000-4000-8000-000000000004';
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = '9c100000-0000-4000-8000-000000000004';
SELECT pg_temp.assert_fails(
  $q$INSERT INTO public.items(user_id,box_id,name,is_wishlist) VALUES
     ('9c100000-0000-4000-8000-000000000004','9c200000-0000-4000-8000-000000000004','lapsed',false)$q$,
  'P0001', 'past_due beyond grace is capped', 'item_limit_reached:102:100');
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.items(user_id,box_id,name,is_wishlist) VALUES
 ('9c100000-0000-4000-8000-000000000001','9c200000-0000-4000-8000-000000000001','service write',false);
RESET ROLE;

ROLLBACK;

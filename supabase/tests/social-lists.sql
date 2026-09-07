BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT
 ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'list-'||n||'@test.invalid',jsonb_build_object('username','list-'||n,'name','SECRET_PRIVATE_NAME')
 FROM generate_series(1,30) n;
INSERT INTO public.public_profiles(user_id,nickname) VALUES
 ('b1000000-0000-4000-8000-000000000002','RemoteAlpha'),
 ('b1000000-0000-4000-8000-000000000003','100%fun');
INSERT INTO public.social_friendships(user_low,user_high,requested_by,status,created_at,accepted_at)
 SELECT 'b1000000-0000-4000-8000-000000000001', ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'b1000000-0000-4000-8000-000000000001','accepted',
  timestamptz '2026-01-01 00:00:00+00' + ((n-1) || ' minutes')::interval,
  timestamptz '2026-01-01 00:00:00+00' + (n || ' minutes')::interval
 FROM generate_series(2,26) n;
UPDATE public.users SET public_access_disabled_at = now() WHERE id = 'b1000000-0000-4000-8000-000000000026';
INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES
 ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000025'),
 ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000029');
INSERT INTO public.social_friendships(user_low,user_high,requested_by,status,created_at) VALUES
 ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000027','b1000000-0000-4000-8000-000000000027','pending','2026-02-01 00:00:00+00'),
 ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000028','b1000000-0000-4000-8000-000000000001','pending','2026-02-02 00:00:00+00');
INSERT INTO public.social_notifications(id,recipient_id,actor_id,kind,event_id,created_at,read_at,resolved_at)
 SELECT f.request_id, CASE WHEN f.requested_by = 'b1000000-0000-4000-8000-000000000001' THEN f.user_high ELSE f.user_low END,
  f.requested_by,'request',f.request_id,f.created_at,NULL,NULL
 FROM public.social_friendships f WHERE f.status='pending' AND f.user_low='b1000000-0000-4000-8000-000000000001';
INSERT INTO public.social_notifications(recipient_id,actor_id,kind,event_id,created_at,read_at,resolved_at) VALUES
 ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000027','acceptance','b2000000-0000-4000-8000-000000000001', now() - interval '100 days', now() - interval '99 days', now() - interval '99 days'),
 ('b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000027','acceptance','b2000000-0000-4000-8000-000000000002', now() - interval '100 days', NULL, NULL);

SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.social_read_page(uuid,text,text,text,jsonb,bigint)','EXECUTE'),'list RPC is service-only');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.social_mark_read(uuid,uuid[],boolean)','EXECUTE'),'mark-read is service-only');
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','public.social_retain_history(interval)','EXECUTE'),'retention is service-only');

SET LOCAL ROLE service_role;
DO $$
DECLARE
 actor uuid := 'b1000000-0000-4000-8000-000000000001';
 page jsonb; next_page jsonb; mutate jsonb; note_id uuid; request_id uuid;
BEGIN
 mutate := public.social_mutate(actor,'b1000000-0000-4000-8000-000000000030','block');
 PERFORM pg_temp.assert_true(mutate->'data'->>'revision' ~ '^[0-9]+$','mutation returns actor revision');

 page := public.social_read_page(actor,'friends');
 PERFORM pg_temp.assert_true(jsonb_array_length(page->'data'->'rows') = 21,'friends lookahead');
 PERFORM pg_temp.assert_true(page::text NOT LIKE '%SECRET_PRIVATE_NAME%' AND page::text NOT LIKE '%list-2@%','no private name or email');
 PERFORM pg_temp.assert_true(page::text NOT LIKE '%000000000025%' AND page::text NOT LIKE '%000000000026%','blocked and unpublished omitted');
 next_page := public.social_read_page(actor,'friends',NULL,NULL,page->'data'->'rows'->19->'key');
 PERFORM pg_temp.assert_true(jsonb_array_length(next_page->'data'->'rows') = 3,'friends next page');
 PERFORM pg_temp.assert_true(next_page->'data'->'rows'->0->'item'->>'id' IS NULL,'friend identity stays nested');
 PERFORM pg_temp.assert_true((SELECT count(*)=1 FROM jsonb_array_elements(public.social_read_page(actor,'friends',NULL,'RemoteAlpha')->'data'->'rows')),'search reaches later page');
 PERFORM pg_temp.assert_true(jsonb_array_length(public.social_read_page(actor,'friends',NULL,'%')->'data'->'rows') = 1,'escaped percent is literal');
 PERFORM pg_temp.assert_true(jsonb_array_length(public.social_read_page(actor,'friends',NULL,'SECRET_PRIVATE_NAME')->'data'->'rows') = 0,'private name is not searchable');
 PERFORM pg_temp.assert_true(jsonb_array_length(public.social_read_page(actor,'friends',NULL,'list-2@')->'data'->'rows') = 0,'email is not searchable');

 page := public.social_read_page(actor,'requests','incoming');
 PERFORM pg_temp.assert_true(jsonb_array_length(page->'data'->'rows') = 1 AND page->'data'->'rows'->0->'item'->>'direction' = 'incoming','incoming only');
 page := public.social_read_page(actor,'requests','outgoing');
 PERFORM pg_temp.assert_true(jsonb_array_length(page->'data'->'rows') = 1 AND page->'data'->'rows'->0->'item'->>'direction' = 'outgoing','outgoing only');
 PERFORM pg_temp.assert_true(public.social_read_page(actor,'requests')->>'ok' = 'false','direction required');

 page := public.social_read_page(actor,'notifications');
 PERFORM pg_temp.assert_true((page->'data'->>'unreadCount')::int >= 1,'unread present');
 PERFORM pg_temp.assert_true(page->'data'->>'unreadCountCapped' = 'false','unread not capped');
 SELECT n.id INTO note_id FROM public.social_notifications n WHERE n.recipient_id = actor AND n.kind='request'
   AND n.actor_id = 'b1000000-0000-4000-8000-000000000027';
 PERFORM pg_temp.assert_true(page::text LIKE '%'||note_id::text||'%','pending request notification visible');
 SELECT f.request_id INTO request_id FROM public.social_friendships f WHERE f.user_high = 'b1000000-0000-4000-8000-000000000027';
 PERFORM pg_temp.assert_true(EXISTS (
   SELECT 1 FROM jsonb_array_elements(page->'data'->'rows') r
   WHERE r->'item'->'actionableRequest'->>'requestId' = request_id::text),'actionable current request');
 PERFORM pg_temp.assert_true(public.social_mutate(actor,'b1000000-0000-4000-8000-000000000027','decline',request_id,1)->>'ok' = 'true','decline incoming');
 page := public.social_read_page(actor,'notifications');
 PERFORM pg_temp.assert_true(NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(page->'data'->'rows') r
   WHERE r->'item'->'actionableRequest'->>'requestId' = request_id::text),'stale action cleared');

 page := public.social_read_page(actor,'blocks');
 PERFORM pg_temp.assert_true(page::text NOT LIKE '%nickname%' AND page::text NOT LIKE '%profile%' AND page::text NOT LIKE '%Collector-%','blocks omit identity');
 PERFORM pg_temp.assert_true(page->'data'->'rows'->0->'item'->>'userId' IS NOT NULL,'block user id only');

 PERFORM pg_temp.assert_true(public.social_read_page(actor,'friends',NULL,NULL,NULL,999)->'error'->>'code' = 'cursor_reset','stale revision');
 PERFORM pg_temp.assert_true(public.social_read_page(actor,'friends',NULL,NULL,'{"id":"bad","value":"bad"}')->'error'->>'code' = 'invalid_input','malformed key');
 PERFORM pg_temp.assert_true(public.social_retain_history(interval '90 days')->>'ok' = 'true','retention runs');
 PERFORM pg_temp.assert_true(NOT EXISTS (
   SELECT 1 FROM public.social_notifications WHERE event_id='b2000000-0000-4000-8000-000000000001'),'old resolved expired');
 PERFORM pg_temp.assert_true(EXISTS (
   SELECT 1 FROM public.social_notifications WHERE event_id='b2000000-0000-4000-8000-000000000002'),'old unread acceptance retained until read');
 PERFORM pg_temp.assert_true(public.social_mark_read(actor,NULL,true)->>'ok' = 'true','mark visible history');
 PERFORM pg_temp.assert_true(NOT EXISTS (
   SELECT 1 FROM public.social_notifications n WHERE n.recipient_id=actor AND n.read_at IS NULL
     AND sharing_private.owner_is_publishable(n.actor_id)
     AND NOT sharing_private.pair_is_blocked(actor,n.actor_id)),'visible history marked');
END $$;
RESET ROLE;
ROLLBACK;

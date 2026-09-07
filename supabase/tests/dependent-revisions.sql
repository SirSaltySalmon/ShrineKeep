BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('c1000000-0000-4000-8000-000000000001','revision-owner@test.invalid','{"username":"revision-owner"}'),
 ('c1000000-0000-4000-8000-000000000002','revision-other@test.invalid','{"username":"revision-other"}');
INSERT INTO public.items(id,user_id,name) VALUES
 ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','One'),
 ('c2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','Two'),
 ('c2000000-0000-4000-8000-000000000003','c1000000-0000-4000-8000-000000000002','Other');
CREATE FUNCTION pg_temp.check_revision(command text, delta bigint DEFAULT 1) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_owner bigint; before_other bigint;
BEGIN
 SELECT sharing_revision INTO before_owner FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001';
 SELECT sharing_revision INTO before_other FROM public.users WHERE id='c1000000-0000-4000-8000-000000000002';
 EXECUTE command;
 PERFORM pg_temp.assert_true((SELECT sharing_revision=before_owner+delta FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001'),command);
 IF delta > 0 THEN
   PERFORM pg_temp.assert_true(public.sharing_read_page('c1000000-0000-4000-8000-000000000001',NULL,'wishlist',NULL,NULL,before_owner)->'error'->>'code'='cursor_reset','old public cursor reset: '||command);
 END IF;
 PERFORM pg_temp.assert_true((SELECT sharing_revision=before_other FROM public.users WHERE id='c1000000-0000-4000-8000-000000000002'),'unrelated owner: '||command);
END $$;
SELECT pg_temp.check_revision($action$INSERT INTO public.photos(item_id,url) SELECT 'c2000000-0000-4000-8000-000000000001','https://example.test/'||n FROM generate_series(1,30) n$action$);
SELECT pg_temp.check_revision($action$UPDATE public.photos SET is_thumbnail=true WHERE item_id='c2000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$DELETE FROM public.photos WHERE item_id='c2000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$INSERT INTO public.value_history(item_id,value) SELECT 'c2000000-0000-4000-8000-000000000001',n FROM generate_series(1,30) n$action$);
SELECT pg_temp.check_revision($action$UPDATE public.value_history SET value=value+1 WHERE item_id='c2000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$DELETE FROM public.value_history WHERE item_id='c2000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$INSERT INTO public.tags(id,user_id,name) VALUES ('c3000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','tag')$action$);
SELECT pg_temp.check_revision($action$UPDATE public.tags SET name='renamed' WHERE id='c3000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$INSERT INTO public.item_tags(item_id,tag_id) VALUES ('c2000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001')$action$);
SELECT pg_temp.check_revision($action$UPDATE public.item_tags SET item_id='c2000000-0000-4000-8000-000000000002' WHERE tag_id='c3000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$DELETE FROM public.item_tags WHERE tag_id='c3000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$DELETE FROM public.tags WHERE id='c3000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$UPDATE public.user_settings SET root_wishlist_visibility='friends' WHERE user_id='c1000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$DELETE FROM public.user_settings WHERE user_id='c1000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$INSERT INTO public.user_settings(user_id) VALUES ('c1000000-0000-4000-8000-000000000001')$action$);
SELECT pg_temp.check_revision($action$INSERT INTO public.public_profiles(user_id,nickname) VALUES ('c1000000-0000-4000-8000-000000000001','Collector')$action$);
SELECT pg_temp.check_revision($action$UPDATE public.public_profiles SET nickname='Renamed' WHERE user_id='c1000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision($action$DELETE FROM public.public_profiles WHERE user_id='c1000000-0000-4000-8000-000000000001'$action$);
SELECT pg_temp.check_revision('UPDATE public.photos SET url=url WHERE false',0);
-- Reassignment by a trusted writer invalidates both owners.
INSERT INTO public.photos(item_id,url) VALUES ('c2000000-0000-4000-8000-000000000001','https://example.test/move');
DO $$ DECLARE a bigint; b bigint; BEGIN
 SELECT sharing_revision INTO a FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001';
 SELECT sharing_revision INTO b FROM public.users WHERE id='c1000000-0000-4000-8000-000000000002';
 UPDATE public.photos SET item_id='c2000000-0000-4000-8000-000000000003' WHERE item_id='c2000000-0000-4000-8000-000000000001';
 PERFORM pg_temp.assert_true((SELECT sharing_revision=a+1 FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001'),'old owner invalidated');
 PERFORM pg_temp.assert_true((SELECT sharing_revision=b+1 FROM public.users WHERE id='c1000000-0000-4000-8000-000000000002'),'new owner invalidated');
END $$;
-- Direct authenticated writers can invalidate through triggers without privilege to call them.
-- Legacy policy allowed cross-owner tag links; dependent cursors must still reset.
INSERT INTO public.tags(id,user_id,name) VALUES ('c3000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001','Legacy tag');
INSERT INTO public.item_tags(item_id,tag_id) VALUES ('c2000000-0000-4000-8000-000000000003','c3000000-0000-4000-8000-000000000002');
DO $$ DECLARE a bigint; b bigint; BEGIN
 SELECT sharing_revision INTO a FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001';
 SELECT sharing_revision INTO b FROM public.users WHERE id='c1000000-0000-4000-8000-000000000002';
 UPDATE public.tags SET name='Renamed legacy tag' WHERE id='c3000000-0000-4000-8000-000000000002';
 PERFORM pg_temp.assert_true((SELECT sharing_revision=a+1 FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001'),'tag owner invalidated');
 PERFORM pg_temp.assert_true((SELECT sharing_revision=b+1 FROM public.users WHERE id='c1000000-0000-4000-8000-000000000002'),'linked item owner invalidated');
 PERFORM pg_temp.assert_true(public.sharing_read_page('c1000000-0000-4000-8000-000000000002',NULL,'wishlist',NULL,NULL,b)->'error'->>'code'='cursor_reset','linked owner cursor resets');
END $$;
CREATE TEMP TABLE revision_before AS SELECT sharing_revision FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001';
GRANT SELECT ON revision_before TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub='c1000000-0000-4000-8000-000000000001';
INSERT INTO public.photos(item_id,url) VALUES ('c2000000-0000-4000-8000-000000000001','https://example.test/direct');
SELECT pg_temp.assert_true((SELECT sharing_revision=(SELECT sharing_revision+1 FROM revision_before) FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001'),'authenticated photo write invalidates');
RESET ROLE;
SELECT pg_temp.assert_true(NOT has_function_privilege('authenticated','sharing_private.bump_item_content_revision()','EXECUTE'),'trigger helper not callable');
-- Cascades still invalidate even after the parent is gone.
DO $$ DECLARE before_revision bigint; BEGIN
 SELECT sharing_revision INTO before_revision FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001';
 DELETE FROM public.items WHERE id='c2000000-0000-4000-8000-000000000001';
 PERFORM pg_temp.assert_true((SELECT sharing_revision>before_revision FROM public.users WHERE id='c1000000-0000-4000-8000-000000000001'),'item cascade invalidates');
END $$;
ROLLBACK;

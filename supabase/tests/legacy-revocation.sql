BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;

CREATE FUNCTION pg_temp.assert_unreadable(query text, label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  BEGIN
    EXECUTE query INTO n;
    IF n IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'Assertion failed: % (rows=%)', label, n;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
 ('e1000000-0000-4000-8000-000000000001','revoke-owner@test.invalid','{"username":"revoke-owner"}'),
 ('e1000000-0000-4000-8000-000000000002','revoke-friend@test.invalid','{"username":"revoke-friend"}'),
 ('e1000000-0000-4000-8000-000000000003','revoke-other@test.invalid','{"username":"revoke-other"}');
INSERT INTO public.social_friendships(user_low,user_high,requested_by,status,accepted_at) VALUES
 ('e1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001','accepted',now());
INSERT INTO public.boxes(id,user_id,name,collection_visibility) VALUES
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','public box','public');
INSERT INTO public.items(id,user_id,box_id,name,acquisition_price,current_value,is_wishlist,expected_price) VALUES
 ('e3000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','owned',12.34,56.78,false,NULL),
 ('e3000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000001',NULL,'wish item',NULL,NULL,true,0);
INSERT INTO public.photos(id,item_id,url,storage_path) VALUES
 ('e5000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','https://example.test/owned.jpg','e1000000-0000-4000-8000-000000000001/items/owned.jpg'),
 ('e5000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002','https://example.test/wish.jpg','e1000000-0000-4000-8000-000000000001/items/wish.jpg');
INSERT INTO public.wish_lists(id,user_id,name,is_public) VALUES
 ('e6000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','public list',true);
INSERT INTO storage.objects(id,bucket_id,name) VALUES
 ('e7000000-0000-4000-8000-000000000001','item-photos','e1000000-0000-4000-8000-000000000001/items/wish.jpg'),
 ('e7000000-0000-4000-8000-000000000002','avatars','e1000000-0000-4000-8000-000000000001/avatar.png');
UPDATE public.user_settings SET
  wishlist_link_enabled=true,
  wishlist_share_token='e4000000-0000-4000-8000-000000000001'
 WHERE user_id='e1000000-0000-4000-8000-000000000001';
GRANT SELECT ON storage.objects TO anon, authenticated;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE (schemaname, tablename, policyname) IN (
      ('public','users','Users can view public profiles'),
      ('public','boxes','Users can view public boxes'),
      ('public','items','Users can view items in public boxes'),
      ('public','items','Public can view wishlist items for public wishlists'),
      ('public','photos','Users can view photos in public items'),
      ('public','photos','Public can view photos for wishlist items in public wishlists'),
      ('public','wish_lists','Users can view public wish lists of friends'),
      ('public','user_settings','Public can view settings for public wishlists'),
      ('storage','objects','Users can view wishlist item photos'),
      ('storage','objects','Public can view wishlist item photos')
    )
  ),
  'ten legacy public-read policies dropped'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects' AND policyname='Public can view avatars'
  ),
  'avatar public read remains for v1'
);

SET LOCAL ROLE anon;
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.users WHERE id=''e1000000-0000-4000-8000-000000000001'' AND email IS NOT NULL',
  'anon cannot read owner email'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.user_settings WHERE user_id=''e1000000-0000-4000-8000-000000000001'' AND wishlist_share_token IS NOT NULL',
  'anon cannot read wishlist token'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.items WHERE id=''e3000000-0000-4000-8000-000000000001'' AND acquisition_price IS NOT NULL',
  'anon cannot read owner financials'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.items WHERE id=''e3000000-0000-4000-8000-000000000001'' AND current_value IS NOT NULL',
  'anon cannot read owner current value'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.photos WHERE item_id=''e3000000-0000-4000-8000-000000000001''',
  'anon cannot read owner photos'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.wish_lists WHERE user_id=''e1000000-0000-4000-8000-000000000001''',
  'anon cannot read wish_lists'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM storage.objects WHERE name=''e1000000-0000-4000-8000-000000000001/items/wish.jpg''',
  'anon cannot read owner wishlist photo blob'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000003';
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.users WHERE id=''e1000000-0000-4000-8000-000000000001'' AND email IS NOT NULL',
  'stranger cannot read owner email'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.user_settings WHERE user_id=''e1000000-0000-4000-8000-000000000001'' AND wishlist_share_token IS NOT NULL',
  'stranger cannot read wishlist token'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.items WHERE id=''e3000000-0000-4000-8000-000000000001'' AND (acquisition_price IS NOT NULL OR current_value IS NOT NULL)',
  'stranger cannot read owner financials'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.photos WHERE item_id=''e3000000-0000-4000-8000-000000000001''',
  'stranger cannot read owner photos'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.wish_lists WHERE user_id=''e1000000-0000-4000-8000-000000000001''',
  'stranger cannot read wish_lists'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM storage.objects WHERE name=''e1000000-0000-4000-8000-000000000001/items/wish.jpg''',
  'stranger cannot read owner wishlist photo blob'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000002';
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.wish_lists WHERE user_id=''e1000000-0000-4000-8000-000000000001''',
  'friend cannot read owner wish_lists after revocation'
);
SELECT pg_temp.assert_unreadable(
  'SELECT count(*) FROM public.users WHERE id=''e1000000-0000-4000-8000-000000000001'' AND email IS NOT NULL',
  'friend cannot read owner email'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL request.jwt.claim.sub = 'e1000000-0000-4000-8000-000000000001';
SELECT pg_temp.assert_true(
  (SELECT email FROM public.users WHERE id='e1000000-0000-4000-8000-000000000001') = 'revoke-owner@test.invalid',
  'owner can still read own email'
);
SELECT pg_temp.assert_true(
  (SELECT wishlist_share_token FROM public.user_settings WHERE user_id='e1000000-0000-4000-8000-000000000001')
    = 'e4000000-0000-4000-8000-000000000001',
  'owner can still read own wishlist token'
);
SELECT pg_temp.assert_true(
  (SELECT acquisition_price::text FROM public.items WHERE id='e3000000-0000-4000-8000-000000000001') = '12.34'
  AND (SELECT current_value::text FROM public.items WHERE id='e3000000-0000-4000-8000-000000000001') = '56.78',
  'owner can still read own financials'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.photos WHERE item_id='e3000000-0000-4000-8000-000000000001') = 1,
  'owner can still read own photos'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM public.wish_lists WHERE user_id='e1000000-0000-4000-8000-000000000001') = 1,
  'owner can still read own wish_lists'
);
SELECT pg_temp.assert_true(
  (SELECT count(*) FROM storage.objects WHERE name='e1000000-0000-4000-8000-000000000001/items/wish.jpg') = 1,
  'owner can still read own item-photos object'
);
RESET ROLE;
ROLLBACK;

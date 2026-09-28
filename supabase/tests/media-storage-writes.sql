BEGIN;
CREATE FUNCTION pg_temp.assert_true(condition boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %', label; END IF; END $$;

SELECT pg_temp.assert_true(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname IN (
      'Authenticated users can upload item photos',
      'Users can update own item photos',
      'Users can delete own item photos'
    )
  ),
  'direct item-photos writes revoked'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can view own item photos'
  ),
  'owner item-photos select remains'
);
SELECT pg_temp.assert_true(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public can view avatars'
  ),
  'avatar public read remains'
);

ROLLBACK;

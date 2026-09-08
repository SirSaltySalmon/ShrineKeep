-- W2: uploads go through the server-signed path. Authenticated clients may no longer
-- INSERT/UPDATE/DELETE item-photos objects directly. Avatars stay as they are for v1.
BEGIN;

DROP POLICY IF EXISTS "Authenticated users can upload item photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own item photos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own item photos" ON storage.objects;

COMMIT;

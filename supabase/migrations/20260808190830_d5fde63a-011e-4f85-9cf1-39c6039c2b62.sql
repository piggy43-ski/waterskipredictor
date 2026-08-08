
DROP POLICY IF EXISTS "Consignment intake photo uploads" ON storage.objects;
CREATE POLICY "Consignment intake photo uploads" ON storage.objects
FOR INSERT TO anon, authenticated
WITH CHECK (bucket_id = 'vault-photos' AND (storage.foldername(name))[1] = 'consign');

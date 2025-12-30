-- Add limit columns to rewards table
ALTER TABLE rewards 
ADD COLUMN IF NOT EXISTS max_total INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS max_per_user INTEGER DEFAULT NULL;

-- Create storage bucket for reward images
INSERT INTO storage.buckets (id, name, public)
VALUES ('reward-images', 'reward-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to reward images
CREATE POLICY "Public can view reward images"
ON storage.objects FOR SELECT
USING (bucket_id = 'reward-images');

-- Allow admins to upload reward images
CREATE POLICY "Admins can upload reward images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'reward-images' 
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow admins to update reward images
CREATE POLICY "Admins can update reward images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'reward-images' 
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);

-- Allow admins to delete reward images
CREATE POLICY "Admins can delete reward images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'reward-images' 
  AND public.has_role(auth.uid(), 'admin'::public.app_role)
);
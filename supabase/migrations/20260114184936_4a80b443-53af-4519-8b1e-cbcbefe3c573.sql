-- Add tutorial tracking columns to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS tutorial_completed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tutorial_completed_at timestamptz;
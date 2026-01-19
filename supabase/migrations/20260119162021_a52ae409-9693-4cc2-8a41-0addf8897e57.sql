-- Add consent tracking columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS age_confirmed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS age_confirmed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tos_accepted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tos_accepted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tos_version TEXT,
ADD COLUMN IF NOT EXISTS privacy_version TEXT;
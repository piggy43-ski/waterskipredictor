-- ============================================================
-- CRITICAL REFACTOR: Remove "odds" terminology, use probabilities + multipliers
-- Phase 1: Add new columns with correct naming (non-breaking)
-- ============================================================

-- 1. MARKETS table: Add proper columns
ALTER TABLE public.markets 
ADD COLUMN IF NOT EXISTS validation_status text,
ADD COLUMN IF NOT EXISTS validation_error text,
ADD COLUMN IF NOT EXISTS multipliers_generated_at timestamptz;

-- Backfill markets from existing odds columns
UPDATE public.markets 
SET validation_status = odds_validation_status 
WHERE validation_status IS NULL AND odds_validation_status IS NOT NULL;

UPDATE public.markets 
SET validation_error = odds_validation_error 
WHERE validation_error IS NULL AND odds_validation_error IS NOT NULL;

-- 2. Add comments to document deprecated columns
COMMENT ON COLUMN public.markets.odds_validation_status IS 'DEPRECATED: Use validation_status instead';
COMMENT ON COLUMN public.markets.odds_validation_error IS 'DEPRECATED: Use validation_error instead';
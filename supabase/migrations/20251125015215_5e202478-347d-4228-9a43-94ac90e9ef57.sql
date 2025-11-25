-- Step 1: Add disciplines array column to athletes table
ALTER TABLE public.athletes ADD COLUMN IF NOT EXISTS disciplines text[] DEFAULT ARRAY[]::text[];

-- Step 2: Consolidate duplicate athlete records
-- Create a temporary table with consolidated data
CREATE TEMP TABLE consolidated_athletes AS
WITH ranked_athletes AS (
  SELECT 
    *,
    ROW_NUMBER() OVER (PARTITION BY name, country, gender ORDER BY created_at) as rn
  FROM public.athletes
),
base_athletes AS (
  SELECT * FROM ranked_athletes WHERE rn = 1
),
aggregated_data AS (
  SELECT 
    name,
    country,
    gender,
    ARRAY_AGG(DISTINCT discipline ORDER BY discipline) FILTER (WHERE discipline IS NOT NULL) as disciplines,
    MAX(CASE WHEN discipline = 'slalom' THEN world_rank END) as current_rank_slalom,
    MAX(CASE WHEN discipline = 'trick' THEN world_rank END) as current_rank_trick,
    MAX(CASE WHEN discipline = 'jump' THEN world_rank END) as current_rank_jump,
    MAX(CASE WHEN discipline = 'slalom' THEN current_points_slalom END) as current_points_slalom,
    MAX(CASE WHEN discipline = 'trick' THEN world_rank END) as current_points_trick,
    MAX(CASE WHEN discipline = 'jump' THEN current_points_jump END) as current_points_jump
  FROM public.athletes
  GROUP BY name, country, gender
)
SELECT 
  b.id,
  b.name,
  b.country,
  b.gender,
  b.federation,
  b.year_of_birth,
  b.country_code,
  b.bio,
  b.profile_image_url,
  a.disciplines,
  a.current_rank_slalom,
  a.current_rank_trick,
  a.current_rank_jump,
  a.current_points_slalom,
  a.current_points_trick,
  a.current_points_jump,
  b.performance_index_slalom,
  b.performance_index_trick,
  b.performance_index_jump,
  b.fantasy_price_slalom,
  b.fantasy_price_trick,
  b.fantasy_price_jump,
  b.popularity_index,
  b.injury_flag,
  b.manual_boost_factor,
  b.created_at,
  b.updated_at
FROM base_athletes b
JOIN aggregated_data a ON b.name = a.name AND b.country = a.country AND b.gender = a.gender;

-- Step 3: Delete all current athletes
DELETE FROM public.athletes;

-- Step 4: Insert consolidated athletes
INSERT INTO public.athletes (
  id, name, country, gender, federation, year_of_birth, country_code, 
  bio, profile_image_url, disciplines, 
  current_rank_slalom, current_rank_trick, current_rank_jump,
  current_points_slalom, current_points_trick, current_points_jump,
  performance_index_slalom, performance_index_trick, performance_index_jump,
  fantasy_price_slalom, fantasy_price_trick, fantasy_price_jump,
  popularity_index, injury_flag, manual_boost_factor,
  created_at, updated_at
)
SELECT 
  id, name, country, gender, federation, year_of_birth, country_code,
  bio, profile_image_url, disciplines,
  current_rank_slalom, current_rank_trick, current_rank_jump,
  current_points_slalom, current_points_trick, current_points_jump,
  performance_index_slalom, performance_index_trick, performance_index_jump,
  fantasy_price_slalom, fantasy_price_trick, fantasy_price_jump,
  popularity_index, injury_flag, manual_boost_factor,
  created_at, updated_at
FROM consolidated_athletes;

-- Step 5: Drop old columns
ALTER TABLE public.athletes DROP COLUMN IF EXISTS discipline;
ALTER TABLE public.athletes DROP COLUMN IF EXISTS world_rank;

-- Step 6: Make disciplines column non-nullable with default empty array
ALTER TABLE public.athletes ALTER COLUMN disciplines SET NOT NULL;
ALTER TABLE public.athletes ALTER COLUMN disciplines SET DEFAULT ARRAY[]::text[];
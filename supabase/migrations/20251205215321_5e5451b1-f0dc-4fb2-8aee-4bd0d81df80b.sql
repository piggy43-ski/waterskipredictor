-- Add comprehensive athlete rating columns for odds engine
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS pro_tour_titles_slalom integer DEFAULT 0;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS pro_tour_titles_trick integer DEFAULT 0;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS pro_tour_titles_jump integer DEFAULT 0;

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS base_strength_slalom numeric DEFAULT 70;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS base_strength_trick numeric DEFAULT 70;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS base_strength_jump numeric DEFAULT 70;

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS form_boost_slalom numeric DEFAULT 0;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS form_boost_trick numeric DEFAULT 0;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS form_boost_jump numeric DEFAULT 0;

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS activity_decay_slalom numeric DEFAULT 0;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS activity_decay_trick numeric DEFAULT 0;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS activity_decay_jump numeric DEFAULT 0;

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS current_rating_slalom numeric DEFAULT 70;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS current_rating_trick numeric DEFAULT 70;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS current_rating_jump numeric DEFAULT 70;

ALTER TABLE athletes ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS is_retired boolean DEFAULT false;
ALTER TABLE athletes ADD COLUMN IF NOT EXISTS retired_date date;
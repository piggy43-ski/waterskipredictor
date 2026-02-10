ALTER TABLE tournament_results 
ALTER COLUMN tie_break_score TYPE text USING tie_break_score::text;
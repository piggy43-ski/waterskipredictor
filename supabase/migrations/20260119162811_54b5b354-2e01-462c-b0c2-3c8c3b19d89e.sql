-- Add round structure columns to tournaments table
ALTER TABLE tournaments
ADD COLUMN has_qualifying BOOLEAN DEFAULT false,
ADD COLUMN has_semifinal BOOLEAN DEFAULT false,
ADD COLUMN has_final BOOLEAN DEFAULT true;
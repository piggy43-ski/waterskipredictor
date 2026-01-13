-- Create Monte Carlo Test Tournament with proper UUID
INSERT INTO tournaments (name, location, start_date, end_date, start_datetime, end_datetime, status, disciplines, notes)
VALUES (
  'Monte Carlo Test Tournament',
  'Internal Testing',
  '2026-06-01',
  '2026-06-03',
  '2026-06-01T08:00:00Z',
  '2026-06-03T18:00:00Z',
  'upcoming',
  ARRAY['slalom']::text[],
  'Internal testing only - not visible to users'
);

-- Create 4 test markets linked to the new tournament
WITH new_tournament AS (
  SELECT id FROM tournaments WHERE name = 'Monte Carlo Test Tournament' LIMIT 1
)
INSERT INTO markets (tournament_id, discipline, category, market_type, name)
SELECT 
  new_tournament.id,
  m.discipline,
  m.category,
  m.market_type,
  m.name
FROM new_tournament, (VALUES 
  ('slalom', 'open_men', 'WINNER', 'Men Slalom - Winner'),
  ('slalom', 'open_men', 'PODIUM', 'Men Slalom - Podium'),
  ('slalom', 'open_men', 'HIGHEST_SCORE', 'Men Slalom - Highest Score'),
  ('slalom', 'open_women', 'WINNER', 'Women Slalom - Winner')
) AS m(discipline, category, market_type, name);

-- Seed market_entries for Men Slalom - Winner
WITH target_market AS (
  SELECT m.id FROM markets m
  JOIN tournaments t ON m.tournament_id = t.id
  WHERE t.name = 'Monte Carlo Test Tournament' AND m.name = 'Men Slalom - Winner' LIMIT 1
)
INSERT INTO market_entries (market_id, athlete_id, is_active)
SELECT target_market.id, a.id, true
FROM target_market, (VALUES 
  ('29e1c2a0-33d6-4d09-894f-49e10de5fcc4'::uuid),
  ('67a2f3c9-cb3f-4a56-af03-ca3f968c2570'::uuid),
  ('f9c8f3c7-100b-4be8-86c7-b34e47a74f38'::uuid),
  ('a63b5000-3bc1-4454-8b2c-fbaf79f817d7'::uuid),
  ('6c170125-154a-41bd-9df2-d8010e5f3030'::uuid),
  ('109a09d7-c2f5-4e5d-a9ad-53bddec630bf'::uuid),
  ('98b3938b-c6ec-4a21-a426-819b151d7370'::uuid),
  ('315b82c8-5da3-465d-bfd9-90a4c449ccba'::uuid),
  ('8e4beb18-50f6-4dc5-87b6-10f3ef685874'::uuid),
  ('6c7915b0-a678-44d5-84d6-1adc435a8027'::uuid)
) AS a(id);

-- Seed market_entries for Men Slalom - Podium
WITH target_market AS (
  SELECT m.id FROM markets m
  JOIN tournaments t ON m.tournament_id = t.id
  WHERE t.name = 'Monte Carlo Test Tournament' AND m.name = 'Men Slalom - Podium' LIMIT 1
)
INSERT INTO market_entries (market_id, athlete_id, is_active)
SELECT target_market.id, a.id, true
FROM target_market, (VALUES 
  ('29e1c2a0-33d6-4d09-894f-49e10de5fcc4'::uuid),
  ('67a2f3c9-cb3f-4a56-af03-ca3f968c2570'::uuid),
  ('f9c8f3c7-100b-4be8-86c7-b34e47a74f38'::uuid),
  ('a63b5000-3bc1-4454-8b2c-fbaf79f817d7'::uuid),
  ('6c170125-154a-41bd-9df2-d8010e5f3030'::uuid),
  ('109a09d7-c2f5-4e5d-a9ad-53bddec630bf'::uuid),
  ('98b3938b-c6ec-4a21-a426-819b151d7370'::uuid),
  ('315b82c8-5da3-465d-bfd9-90a4c449ccba'::uuid),
  ('8e4beb18-50f6-4dc5-87b6-10f3ef685874'::uuid),
  ('6c7915b0-a678-44d5-84d6-1adc435a8027'::uuid)
) AS a(id);

-- Seed market_entries for Men Slalom - Highest Score
WITH target_market AS (
  SELECT m.id FROM markets m
  JOIN tournaments t ON m.tournament_id = t.id
  WHERE t.name = 'Monte Carlo Test Tournament' AND m.name = 'Men Slalom - Highest Score' LIMIT 1
)
INSERT INTO market_entries (market_id, athlete_id, is_active)
SELECT target_market.id, a.id, true
FROM target_market, (VALUES 
  ('29e1c2a0-33d6-4d09-894f-49e10de5fcc4'::uuid),
  ('67a2f3c9-cb3f-4a56-af03-ca3f968c2570'::uuid),
  ('f9c8f3c7-100b-4be8-86c7-b34e47a74f38'::uuid),
  ('a63b5000-3bc1-4454-8b2c-fbaf79f817d7'::uuid),
  ('6c170125-154a-41bd-9df2-d8010e5f3030'::uuid),
  ('109a09d7-c2f5-4e5d-a9ad-53bddec630bf'::uuid),
  ('98b3938b-c6ec-4a21-a426-819b151d7370'::uuid),
  ('315b82c8-5da3-465d-bfd9-90a4c449ccba'::uuid),
  ('8e4beb18-50f6-4dc5-87b6-10f3ef685874'::uuid),
  ('6c7915b0-a678-44d5-84d6-1adc435a8027'::uuid)
) AS a(id);

-- Seed market_entries for Women Slalom - Winner
WITH target_market AS (
  SELECT m.id FROM markets m
  JOIN tournaments t ON m.tournament_id = t.id
  WHERE t.name = 'Monte Carlo Test Tournament' AND m.name = 'Women Slalom - Winner' LIMIT 1
)
INSERT INTO market_entries (market_id, athlete_id, is_active)
SELECT target_market.id, a.id, true
FROM target_market, (VALUES 
  ('296e6fd6-ef62-4395-85e9-7b9ac6fe8238'::uuid),
  ('5ea128d3-9eb2-41c1-899a-ea618f1d22f7'::uuid),
  ('4d75ecb0-a8ad-452d-8536-bf1bcc903039'::uuid),
  ('01acda7d-2d78-4098-9d3c-d0245eada8f1'::uuid),
  ('4d1d55d4-5385-40ee-9018-7a6de5808ee7'::uuid),
  ('e8cae5da-3728-43dd-908a-53347efaa9f0'::uuid),
  ('be12744c-5551-4968-bc43-febf1dbd8c9f'::uuid),
  ('0a66bef9-8716-4053-ad48-7a67465dc6e9'::uuid),
  ('43f03f36-4b31-43d3-b7ba-06d700a12f00'::uuid)
) AS a(id);
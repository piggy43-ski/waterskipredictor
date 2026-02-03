

# Add 10 Pro-Am Tournaments (2026 Season)

## Overview

Adding 10 water ski tournaments for the **2026 season**. All tournaments will have **semi-finals and finals only** (no qualifying rounds).

---

## Tournaments to Add

| # | Name | Location | Dates | Disciplines |
|---|------|----------|-------|-------------|
| 1 | Botaski ProAm | Seseña, Spain | June 25-28, 2026 | Slalom, Trick |
| 2 | San Gervasio ProAm | San Gervasio, Italy | July 3-5, 2026 | Slalom |
| 3 | PKB ProAm | Ivrea, Italy | July 7-8, 2026 | Slalom |
| 4 | Recetto ProAm | Recetto, Italy | July 10-12, 2026 | Slalom |
| 5 | Putrajaya Masters | Putrajaya, Malaysia | July 18-19, 2026 | Slalom, Trick, Jump |
| 6 | Rocky Mountain ProAm | Calgary, Canada | July 30 - Aug 2, 2026 | Slalom, Trick, Jump |
| 7 | California ProAm | Elk Grove, California | Aug 28-30, 2026 | Slalom, Trick, Jump |
| 8 | Lake 38 ProAm | Tallahassee, Florida | Sep 11-13, 2026 | Slalom |
| 9 | Travers Grand Prix | Groveland, Florida | Sep 25-27, 2026 | Slalom |
| 10 | Miami Pro | Miami, Florida | Oct 3-4, 2026 | Slalom |

---

## Round Configuration

All tournaments:
- `has_qualifying` = false
- `has_semifinal` = true  
- `has_final` = true

---

## Database Insert

```sql
INSERT INTO tournaments (
  name, location, start_date, end_date, 
  start_datetime, end_datetime, 
  disciplines, year, status,
  has_qualifying, has_semifinal, has_final
) VALUES
('Botaski ProAm', 'Seseña, Spain', 
 '2026-06-25', '2026-06-28', 
 '2026-06-25T08:00:00Z', '2026-06-28T18:00:00Z',
 ARRAY['slalom', 'trick'], 2026, 'upcoming', false, true, true),
 
('San Gervasio ProAm', 'San Gervasio, Italy', 
 '2026-07-03', '2026-07-05', 
 '2026-07-03T08:00:00Z', '2026-07-05T18:00:00Z',
 ARRAY['slalom'], 2026, 'upcoming', false, true, true),
 
('PKB ProAm', 'Ivrea, Italy', 
 '2026-07-07', '2026-07-08', 
 '2026-07-07T08:00:00Z', '2026-07-08T18:00:00Z',
 ARRAY['slalom'], 2026, 'upcoming', false, true, true),

('Recetto ProAm', 'Recetto, Italy', 
 '2026-07-10', '2026-07-12', 
 '2026-07-10T08:00:00Z', '2026-07-12T18:00:00Z',
 ARRAY['slalom'], 2026, 'upcoming', false, true, true),

('Putrajaya Masters', 'Putrajaya, Malaysia', 
 '2026-07-18', '2026-07-19', 
 '2026-07-18T08:00:00Z', '2026-07-19T18:00:00Z',
 ARRAY['slalom', 'trick', 'jump'], 2026, 'upcoming', false, true, true),

('Rocky Mountain ProAm', 'Calgary, Canada', 
 '2026-07-30', '2026-08-02', 
 '2026-07-30T08:00:00Z', '2026-08-02T18:00:00Z',
 ARRAY['slalom', 'trick', 'jump'], 2026, 'upcoming', false, true, true),

('California ProAm', 'Elk Grove, California', 
 '2026-08-28', '2026-08-30', 
 '2026-08-28T08:00:00Z', '2026-08-30T18:00:00Z',
 ARRAY['slalom', 'trick', 'jump'], 2026, 'upcoming', false, true, true),

('Lake 38 ProAm', 'Tallahassee, Florida', 
 '2026-09-11', '2026-09-13', 
 '2026-09-11T08:00:00Z', '2026-09-13T18:00:00Z',
 ARRAY['slalom'], 2026, 'upcoming', false, true, true),

('Travers Grand Prix', 'Groveland, Florida', 
 '2026-09-25', '2026-09-27', 
 '2026-09-25T08:00:00Z', '2026-09-27T18:00:00Z',
 ARRAY['slalom'], 2026, 'upcoming', false, true, true),

('Miami Pro', 'Miami, Florida', 
 '2026-10-03', '2026-10-04', 
 '2026-10-03T08:00:00Z', '2026-10-04T18:00:00Z',
 ARRAY['slalom'], 2026, 'upcoming', false, true, true);
```

---

## Result

After execution:
- **10 new tournaments** added for the 2026 season
- All visible on the Admin Tournaments page
- All configured for semi-finals + finals (no qualifying)
- Ready for athlete entries and market creation


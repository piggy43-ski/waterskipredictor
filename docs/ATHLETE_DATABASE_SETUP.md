# Athlete Database Setup Guide

## Overview
The athlete database has been pre-seeded with approximately 180 real IWWF-ranked athletes (top 30 per discipline/gender combination).

## Database Structure

### Athletes Table
Contains ~180 athletes with the following data:
- **Name & Identity**: Full name, gender, country, country code, year of birth
- **Disciplines**: Array of disciplines (slalom, trick, jump) - some athletes compete in multiple
- **Current Rankings**: Separate rank fields per discipline (current_rank_slalom, current_rank_trick, current_rank_jump)
- **Current Points**: Separate points fields per discipline
- **Performance Metrics**: 
  - performance_index per discipline (0-1 scale)
  - fantasy_price per discipline (50-500 tokens)
  - popularity_index (based on user predictions)
- **Management Fields**: injury_flag, manual_boost_factor

### Example Athletes
**Men's Slalom Top 5:**
1. William Asher (GBR)
2. Nate Smith (USA)
3. Freddie Winter (GBR)
4. Thomas Degasperi (ITA)
5. Joel Howley (AUS)

**Women's Slalom Top 5:**
1. Regina Jaquess (USA)
2. Whitney McClintock Rini (CAN)
3. Giannina Bonnemann (ARG)
4. Manon Costard (FRA)
5. Anna Gay (IRL)

**Multi-Discipline Athletes:**
- Martin Kolman (CZE): Slalom, Trick, Jump
- Dorien Llewellyn (CAN): Slalom, Trick, Jump
- Anna Gay (IRL): Slalom, Trick, Jump
- Erika Lang (USA): Slalom, Trick, Jump

## Updating Rankings

### Method 1: Rankings Import Tool (Recommended)
1. Visit IWWF EMS: https://ems.iwwf.sport/RankingList/RankingListWaterski
2. Select discipline and gender category
3. Export or copy ranking table data
4. Format as CSV with columns: Rank, Name, Country, Points
5. Use Admin → Rankings Import to paste and import
6. System will match athletes by name + country
7. Performance indices automatically recalculated

### Method 2: Manual Updates
1. Go to Admin → Athletes
2. Search for specific athlete
3. Click "View Details"
4. Edit ranking and points fields
5. Click "Recalculate performance & fantasy value"

### Method 3: Bulk SQL Update
For advanced users, use the Lovable Cloud SQL interface:
```sql
UPDATE athletes 
SET current_rank_slalom = 1, current_points_slalom = 5000
WHERE name = 'William Asher';
```

## Performance Calculation

### Performance Index Formula
```
rank_score = (31 - rank) / 30
recent_performance_score = avg(last 3 event scores)
base_index = 0.6 * rank_score + 0.4 * recent_performance_score
final_index = clamp(base_index * manual_boost_factor, 0, 1)
```

### Fantasy Price Formula
```
base_price = 100 tokens
fantasy_price = round(base_price * (0.5 + 1.5 * performance_index + 0.5 * popularity_index))
min: 50 tokens, max: 500 tokens
```

### When Recalculation Happens
- After ranking imports
- After tournament result entries
- When injury_flag or manual_boost_factor changes
- Manual trigger from athlete detail page

## Data Flow

```
IWWF EMS Rankings
       ↓
CSV Export (manual)
       ↓
Rankings Import Tool
       ↓
Match Athletes (name + country)
       ↓
Update current_rank_* and current_points_*
       ↓
Store snapshot in athlete_rankings table
       ↓
Trigger performance recalculation
       ↓
Update performance_index_* and fantasy_price_*
```

## Maintenance Tasks

### Weekly
- Import latest rankings from IWWF EMS for active competition season
- Review and update injury flags for injured athletes
- Check for new athletes not in the database

### After Each Tournament
- Enter results via Admin → Results
- System will automatically:
  - Update recent_performance_scores
  - Recalculate performance indices
  - Update fantasy prices
  - Store historical data

### Monthly
- Review popularity_index trends
- Adjust manual_boost_factor for standout performers
- Archive old ranking snapshots if needed

## Troubleshooting

### Athlete Not Found During Import
- Verify name spelling matches exactly (case-insensitive)
- Check country code is correct (3-letter ISO code)
- Manually add athlete via Athletes page if needed

### Performance Index Seems Wrong
- Check recent results are entered correctly
- Verify rank is current
- Review manual_boost_factor (should be 1.0 by default)
- Check injury_flag (reduces by 30% when true)
- Use "Recalculate" button to force update

### Rankings Out of Date
- IWWF updates rankings regularly during competition season
- Import new rankings as available
- Historical snapshots preserved in athlete_rankings table

## Future Enhancements

### Planned Features
- API integration with IWWF when available
- Automated scraping via headless browser (Puppeteer)
- Real-time ranking updates during live events
- Athlete profile pictures from official sources
- Performance trend charts and analytics

### Technical Considerations
- IWWF EMS is a JavaScript-heavy dynamic site
- Direct scraping requires browser automation
- May require official API access or partnership
- Current manual CSV import is most reliable approach

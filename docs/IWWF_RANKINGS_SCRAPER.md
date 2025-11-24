# IWWF Rankings Auto-Sync Documentation

## Overview

The IWWF Rankings Auto-Sync system automatically fetches and updates athlete rankings from the IWWF EMS (Event Management System) website daily. This eliminates the need for manual CSV imports and keeps athlete data current.

## Components

### 1. Edge Function: `sync-iwwf-rankings`

**Location:** `supabase/functions/sync-iwwf-rankings/index.ts`

**Purpose:** Scrapes IWWF EMS website and imports rankings data

**Features:**
- Fetches top 30 athletes per discipline (Slalom, Trick, Jump) and gender (Male, Female)
- Creates new athlete profiles for unknown athletes
- Updates existing athlete ranks and points
- Stores historical ranking snapshots
- Respects rate limits with 2-second delays between requests

**Invocation:**
- **Automatic:** Daily at 6:00 AM UTC via cron job
- **Manual:** Via Admin Panel → Rankings Auto-Sync page

### 2. Admin Interface: `RankingsSync`

**Location:** `src/pages/admin/RankingsSync.tsx`

**Features:**
- Trigger manual sync with one click
- View last sync results and statistics
- Monitor errors and detailed processing logs
- See schedule information

### 3. Cron Job

**Schedule:** Daily at 6:00 AM UTC

**Configuration:** Stored in `pg_cron` extension

**Query:**
```sql
SELECT cron.schedule(
  'sync-iwwf-rankings-daily',
  '0 6 * * *',
  $$ ... $$
);
```

## How It Works

### Data Flow

1. **Fetch Phase**
   - Edge function makes HTTP requests to IWWF EMS website
   - Parses HTML/JSON response for ranking data
   - Extracts: rank, athlete name, country, points

2. **Match Phase**
   - Searches for existing athlete by name + country
   - If found: updates rank/points
   - If not found: creates new athlete record

3. **Store Phase**
   - Updates `athletes` table with current rank/points
   - Inserts snapshot into `athlete_rankings` table
   - Preserves historical data for trend analysis

4. **Calculate Phase** (future)
   - Triggers performance index recalculation
   - Updates fantasy prices based on new rankings

### HTML Parsing

The scraper uses regex patterns to extract data from HTML tables:

```javascript
const rowPattern = /<tr[^>]*>.*?<td[^>]*>(\d+)<\/td>.*?<td[^>]*>([^<]+)<\/td>.*?<td[^>]*>([A-Z]{2,3})<\/td>.*?<td[^>]*>([\d.]+)<\/td>.*?<\/tr>/gis;
```

**Captured Groups:**
1. Rank number
2. Athlete name
3. Country code (2-3 letters)
4. Points (decimal number)

## Maintenance

### When IWWF Website Changes

If the IWWF EMS website structure changes, you'll need to update:

1. **URL Structure** (`fetchIWWFRankings` function)
   - Update base URL if domain changes
   - Adjust query parameters if API changes

2. **HTML Parsing** (`parseRankingsFromHTML` function)
   - Update regex patterns to match new HTML structure
   - Adjust selectors for table rows and cells

3. **Data Mapping**
   - Update `disciplineMap` and `genderMap` if terminology changes
   - Adjust field names if data structure changes

### Testing Changes

1. **Manual Trigger Test**
   - Go to Admin Panel → Rankings Auto-Sync
   - Click "Trigger Manual Sync"
   - Monitor results and errors

2. **Check Logs**
   ```javascript
   // View edge function logs in Supabase dashboard
   // Or use the CLI:
   supabase functions logs sync-iwwf-rankings
   ```

3. **Verify Data**
   ```sql
   -- Check latest rankings
   SELECT * FROM athlete_rankings 
   ORDER BY list_date DESC 
   LIMIT 30;
   
   -- Check athlete updates
   SELECT name, current_rank_slalom, current_points_slalom 
   FROM athletes 
   WHERE current_rank_slalom IS NOT NULL
   ORDER BY current_rank_slalom;
   ```

## Error Handling

### Common Errors

1. **HTTP Errors (4xx, 5xx)**
   - **Cause:** IWWF website down or blocking requests
   - **Solution:** Check website availability, adjust User-Agent header
   - **Retry:** Automatic on next scheduled run

2. **Parse Errors (No Data Found)**
   - **Cause:** HTML structure changed
   - **Solution:** Update regex patterns in `parseRankingsFromHTML`
   - **Debug:** Check raw HTML response in logs

3. **Database Errors**
   - **Cause:** RLS policy issues, constraint violations
   - **Solution:** Check Supabase logs, verify athlete data
   - **Recovery:** Fix data issues, re-run sync

### Error Monitoring

All errors are:
- Logged to edge function logs
- Returned in sync response JSON
- Displayed in Admin Panel interface

## Rate Limiting

**Current Setting:** 2-second delay between discipline/gender combos

**Total Time per Sync:** ~12 seconds (6 combinations × 2 seconds)

**Respectful Scraping:**
- Uses descriptive User-Agent
- Implements delays between requests
- Only fetches top 30 (minimal data)
- Runs once daily (not aggressive)

## Future Enhancements

### Potential Improvements

1. **API Integration**
   - If IWWF provides an official API, switch from scraping to API calls
   - More reliable and faster
   - No parsing required

2. **Intelligent Caching**
   - Only fetch if rankings have actually changed
   - Use ETags or Last-Modified headers
   - Reduce unnecessary requests

3. **Webhook Integration**
   - IWWF could send webhook when rankings update
   - Instant updates instead of daily polling
   - More real-time data

4. **Performance Recalculation**
   - Automatically trigger `recalculateAthletePerformance` after sync
   - Keep fantasy prices and odds seeds current
   - Integrated into sync workflow

5. **Historical Trend Analysis**
   - Track rank changes over time
   - Calculate momentum indicators
   - Visualize progression graphs

## Troubleshooting

### Sync Not Running

**Check:**
```sql
-- View cron jobs
SELECT * FROM cron.job;

-- View cron job runs
SELECT * FROM cron.job_run_details 
ORDER BY start_time DESC 
LIMIT 10;
```

### Manual Invocation

```bash
# Using curl
curl -X POST \
  https://mgcqkprehxtqjmfoqsro.supabase.co/functions/v1/sync-iwwf-rankings \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"manual": true}'
```

### Disable Auto-Sync

```sql
-- Temporarily disable
SELECT cron.unschedule('sync-iwwf-rankings-daily');

-- Re-enable
SELECT cron.schedule(
  'sync-iwwf-rankings-daily',
  '0 6 * * *',
  $$ ... $$
);
```

## Security Considerations

- **Service Role Key:** Edge function uses service role for write access
- **Rate Limiting:** Prevents abuse of IWWF servers
- **Error Logging:** No sensitive data logged
- **CORS:** Enabled for admin panel access

## Performance

- **Execution Time:** ~15-20 seconds per full sync
- **Database Impact:** Minimal (batch operations with delays)
- **API Calls:** 6 HTTP requests per sync (one per discipline/gender combo)
- **Storage:** ~180 rows per sync (30 athletes × 6 categories)

## Maintenance Schedule

- **Weekly:** Review sync logs for errors
- **Monthly:** Verify data accuracy against IWWF website
- **Quarterly:** Check for IWWF website structure changes
- **Annually:** Review and optimize parsing logic

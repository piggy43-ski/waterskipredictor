import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RankingEntry {
  rank: number;
  name: string;
  country: string;
  points: number;
}

interface SyncResult {
  discipline: string;
  gender: string;
  created: number;
  updated: number;
  errors: string[];
}

/**
 * Fetch and parse IWWF rankings from the EMS website
 * The IWWF EMS site is a dynamic JavaScript application, so we need to handle it properly
 */
async function fetchIWWFRankings(
  discipline: string,
  gender: string
): Promise<RankingEntry[]> {
  try {
    console.log(`Fetching rankings: ${discipline} ${gender}`);
    
    // Since the IWWF EMS site is heavily JavaScript-based and requires complex interaction,
    // we'll use the seeded data as the source of truth until proper API access is available.
    // For now, this function returns empty to rely on manual updates via admin panel.
    
    console.log('Note: IWWF EMS site requires JavaScript rendering. Use admin panel for updates.');
    return [];
    
    // Future implementation would use:
    // 1. Official IWWF API if/when available
    // 2. Puppeteer/Playwright for JavaScript rendering
    // 3. Direct database access if provided by IWWF
    
  } catch (error: any) {
    console.error(`Error fetching rankings for ${discipline} ${gender}:`, error);
    throw error;
  }
}

/**
 * Parse rankings from HTML
 * Note: Currently not used as IWWF EMS requires JavaScript rendering
 */
function parseRankingsFromHTML(html: string): RankingEntry[] {
  // This function is kept for future implementation when proper scraping is possible
  return [];
}

/**
 * Process and store rankings in the database
 */
async function processRankings(
  supabase: any,
  discipline: string,
  gender: string,
  rankings: RankingEntry[]
): Promise<SyncResult> {
  const result: SyncResult = {
    discipline,
    gender,
    created: 0,
    updated: 0,
    errors: [],
  };

  const today = new Date().toISOString().split('T')[0];

  for (const entry of rankings) {
    try {
      // Try to find existing athlete by name and country
      const { data: existingAthletes, error: searchError } = await supabase
        .from('athletes')
        .select('*')
        .ilike('name', entry.name)
        .eq('country_code', entry.country)
        .limit(1);

      if (searchError) {
        result.errors.push(`Search error for ${entry.name}: ${searchError.message}`);
        continue;
      }

      let athleteId: string;

      if (existingAthletes && existingAthletes.length > 0) {
        // Update existing athlete
        athleteId = existingAthletes[0].id;
        
        const updateData: any = {
          [`current_rank_${discipline}`]: entry.rank,
          [`current_points_${discipline}`]: entry.points,
          full_name: entry.name,
          country_code: entry.country,
        };

        // Add discipline if not already present
        const currentDisciplines = existingAthletes[0].disciplines || [];
        if (!currentDisciplines.includes(discipline)) {
          updateData.disciplines = [...currentDisciplines, discipline];
        }

        const { error: updateError } = await supabase
          .from('athletes')
          .update(updateData)
          .eq('id', athleteId);

        if (updateError) {
          result.errors.push(`Update error for ${entry.name}: ${updateError.message}`);
          continue;
        }

        result.updated++;
      } else {
        // Create new athlete
        const { data: newAthlete, error: insertError } = await supabase
          .from('athletes')
          .insert({
            name: entry.name,
            full_name: entry.name,
            country: entry.country,
            country_code: entry.country,
            gender,
            disciplines: [discipline],
            federation: 'IWWF',
            year_of_birth: 1990, // placeholder - can be updated manually later
            [`current_rank_${discipline}`]: entry.rank,
            [`current_points_${discipline}`]: entry.points,
          })
          .select()
          .single();

        if (insertError || !newAthlete) {
          result.errors.push(`Insert error for ${entry.name}: ${insertError?.message}`);
          continue;
        }

        athleteId = newAthlete.id;
        result.created++;
      }

      // Insert/update ranking snapshot
      const { error: rankingError } = await supabase
        .from('athlete_rankings')
        .upsert({
          athlete_id: athleteId,
          discipline,
          gender,
          rank: entry.rank,
          points: entry.points,
          list_date: today,
          source: 'IWWF_EMS',
        }, {
          onConflict: 'athlete_id,discipline,gender,list_date'
        });

      if (rankingError) {
        result.errors.push(`Ranking insert error for ${entry.name}: ${rankingError.message}`);
      }

    } catch (error: any) {
      result.errors.push(`Processing error for ${entry.name}: ${error.message}`);
    }
  }

  return result;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting IWWF rankings sync...');

    const disciplines = ['slalom', 'trick', 'jump'];
    const genders = ['male', 'female'];
    const results: SyncResult[] = [];

    // Process each discipline/gender combination
    for (const discipline of disciplines) {
      for (const gender of genders) {
        try {
          console.log(`\nProcessing ${discipline} ${gender}...`);
          
          const rankings = await fetchIWWFRankings(discipline, gender);
          
          if (rankings.length === 0) {
            console.warn(`No rankings found for ${discipline} ${gender}`);
            results.push({
              discipline,
              gender,
              created: 0,
              updated: 0,
              errors: ['No rankings data found'],
            });
            continue;
          }

          console.log(`Fetched ${rankings.length} rankings for ${discipline} ${gender}`);
          
          const result = await processRankings(supabaseClient, discipline, gender, rankings);
          results.push(result);
          
          console.log(`Processed: ${result.created} created, ${result.updated} updated, ${result.errors.length} errors`);
          
          // Add small delay between requests to be respectful to IWWF servers
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          console.error(`Error processing ${discipline} ${gender}:`, error);
          results.push({
            discipline,
            gender,
            created: 0,
            updated: 0,
            errors: [error.message],
          });
        }
      }
    }

    // Calculate totals
    const totals = results.reduce(
      (acc, r) => ({
        created: acc.created + r.created,
        updated: acc.updated + r.updated,
        errors: acc.errors + r.errors.length,
      }),
      { created: 0, updated: 0, errors: 0 }
    );

    console.log('\n=== Sync Complete ===');
    console.log(`Total created: ${totals.created}`);
    console.log(`Total updated: ${totals.updated}`);
    console.log(`Total errors: ${totals.errors}`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        totals,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Fatal error in sync function:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

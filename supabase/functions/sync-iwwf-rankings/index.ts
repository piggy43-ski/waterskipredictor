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
 * Note: This is a simplified scraper. The actual implementation may need
 * to handle authentication, AJAX requests, or API endpoints depending on
 * how the IWWF EMS site is structured.
 */
async function fetchIWWFRankings(
  discipline: string,
  gender: string
): Promise<RankingEntry[]> {
  try {
    // IWWF EMS ranking URL structure (this may need adjustment based on actual site)
    const disciplineMap: Record<string, string> = {
      slalom: 'Slalom',
      trick: 'Trick',
      jump: 'Jump',
    };
    
    const genderMap: Record<string, string> = {
      male: 'Men',
      female: 'Women',
    };

    // Construct URL - this is a placeholder and may need adjustment
    const baseUrl = 'https://ems.iwwf.sport/RankingList/RankingListWaterski';
    const params = new URLSearchParams({
      discipline: disciplineMap[discipline] || discipline,
      category: genderMap[gender] || gender,
      // Add more params as needed based on actual IWWF site
    });

    console.log(`Fetching rankings: ${discipline} ${gender}`);
    console.log(`URL: ${baseUrl}?${params.toString()}`);

    const response = await fetch(`${baseUrl}?${params.toString()}`, {
      headers: {
        'User-Agent': 'IWWF-Ranking-Sync-Bot/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    // Parse HTML to extract rankings
    // This is a simplified parser - actual implementation depends on HTML structure
    const rankings = parseRankingsFromHTML(html);
    
    // Return top 30 only
    return rankings.slice(0, 30);
  } catch (error: any) {
    console.error(`Error fetching rankings for ${discipline} ${gender}:`, error);
    throw error;
  }
}

/**
 * Parse rankings from HTML
 * This is a simplified implementation - needs to be adapted to actual HTML structure
 */
function parseRankingsFromHTML(html: string): RankingEntry[] {
  const rankings: RankingEntry[] = [];
  
  try {
    // Look for table rows with ranking data
    // This regex pattern may need adjustment based on actual HTML structure
    const rowPattern = /<tr[^>]*>.*?<td[^>]*>(\d+)<\/td>.*?<td[^>]*>([^<]+)<\/td>.*?<td[^>]*>([A-Z]{2,3})<\/td>.*?<td[^>]*>([\d.]+)<\/td>.*?<\/tr>/gis;
    
    let match;
    while ((match = rowPattern.exec(html)) !== null) {
      const rank = parseInt(match[1].trim());
      const name = match[2].trim().replace(/\s+/g, ' ');
      const country = match[3].trim();
      const points = parseFloat(match[4].trim());
      
      if (rank && name && country && !isNaN(points)) {
        rankings.push({ rank, name, country, points });
      }
    }
    
    // If regex parsing fails, try alternative parsing methods
    if (rankings.length === 0) {
      console.warn('Regex parsing returned no results, attempting alternative parsing');
      // Could add JSON parsing if site provides data-* attributes or script tags
    }
    
    return rankings;
  } catch (error: any) {
    console.error('Error parsing HTML:', error);
    return [];
  }
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

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Tier seeding configuration - elite athletes
const ATHLETE_TIER_SEEDS: Record<string, Array<{ discipline: string; tier: string; defaultPodiumRate: number }>> = {
  // Men's Slalom Tier 1
  'Nate Smith': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.80 }],
  'Smith Nate': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.80 }],
  'Charlie Ross': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Ross Charlie': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Will Asher': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Asher Will': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Freddie Winter': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.55 }],
  'Winter Freddie': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.55 }],
  'Thomas Degasperi': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.50 }],
  'Degasperi Thomas': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.50 }],
  
  // Women's Slalom Tier 1
  'Regina Jaquess': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.85 }],
  'Jaquess Regina': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.85 }],
  'Whitney McClintock Rini': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Whitney McClintock': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Jaimee Bull': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Bull Jaimee': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Manon Costard': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.55 }],
  'Costard Manon': [{ discipline: 'slalom', tier: 'tier1', defaultPodiumRate: 0.55 }],
  
  // Men's Trick Tier 1
  'Patricio Font': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Font Patricio': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Aliaksei Zharnasek': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Zharnasek Aliaksei': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Adam Pickos': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Pickos Adam': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.60 }],
  
  // Women's Trick Tier 1
  'Erika Lang': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.75 }],
  'Lang Erika': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.75 }],
  'Anna Gay': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Gay Anna': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Neilly Ross': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Ross Neilly': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Giannina Bonnemann': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.55 }],
  'Bonnemann Giannina': [{ discipline: 'trick', tier: 'tier1', defaultPodiumRate: 0.55 }],
  
  // Men's Jump Tier 1
  'Freddy Krueger': [{ discipline: 'jump', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Krueger Freddy': [{ discipline: 'jump', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Ryan Dodd': [{ discipline: 'jump', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Dodd Ryan': [{ discipline: 'jump', tier: 'tier1', defaultPodiumRate: 0.65 }],
  
  // Women's Jump Tier 1
  'Hanna Straltsova': [{ discipline: 'jump', tier: 'tier1', defaultPodiumRate: 0.80 }],
  'Straltsova Hanna': [{ discipline: 'jump', tier: 'tier1', defaultPodiumRate: 0.80 }],
};

const TIER_BONUSES: Record<string, number> = {
  tier1: 0.15,
  tier2: 0.07,
  tier3: 0.03,
  unranked: 0,
};

const FANTASY_PRICE_BANDS: Record<string, { base: number; maxMultiplier: number }> = {
  tier1: { base: 12000, maxMultiplier: 1.5 },
  tier2: { base: 8000, maxMultiplier: 1.3 },
  tier3: { base: 5000, maxMultiplier: 1.2 },
  unranked: { base: 3000, maxMultiplier: 1.1 },
};

function getTierFromRank(rank: number | null): string {
  if (!rank || rank <= 0) return 'unranked';
  if (rank <= 5) return 'tier1';
  if (rank <= 15) return 'tier2';
  if (rank <= 30) return 'tier3';
  return 'unranked';
}

function calculateStrengthScore(
  seasonPodiumRate: number,
  careerPodiumRate: number,
  seasonAvgPlace: number | null,
  tierBonus: number
): number {
  const avgPlaceScore = seasonAvgPlace && seasonAvgPlace > 0
    ? Math.min(1, 1 / seasonAvgPlace)
    : 0.1;
  
  return Math.max(0.05, (
    0.4 * seasonPodiumRate +
    0.2 * careerPodiumRate +
    0.2 * avgPlaceScore +
    0.2 * tierBonus
  ));
}

function calculateFantasyPrice(tier: string, seasonPodiumRate: number): number {
  const band = FANTASY_PRICE_BANDS[tier] || FANTASY_PRICE_BANDS.unranked;
  const multiplier = 1 + (seasonPodiumRate * (band.maxMultiplier - 1));
  return Math.max(2000, Math.min(20000, Math.round(band.base * multiplier)));
}

function calculatePriceFromRank(rank: number | null): number {
  if (!rank || rank <= 0) return 3000;
  if (rank <= 5) return 12000 + Math.max(0, (6 - rank) * 1000);
  if (rank <= 15) return 8000 + Math.max(0, (16 - rank) * 200);
  if (rank <= 30) return 5000;
  return 3000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    console.log('Starting athlete stats seeding...');
    
    // Fetch all athletes
    const { data: athletes, error: athletesError } = await supabase
      .from('athletes')
      .select('*');
    
    if (athletesError) {
      throw new Error(`Failed to fetch athletes: ${athletesError.message}`);
    }
    
    console.log(`Processing ${athletes?.length || 0} athletes...`);
    
    let updated = 0;
    let errors = 0;
    
    for (const athlete of athletes || []) {
      try {
        const updates: Record<string, any> = {};
        
        // Check for tier seeding
        const seedingEntries = ATHLETE_TIER_SEEDS[athlete.name] || [];
        
        for (const discipline of ['slalom', 'trick', 'jump']) {
          // Check if this athlete has a known tier seeding for this discipline
          const seeding = seedingEntries.find(s => s.discipline === discipline);
          
          // Determine tier from seeding or from current rank
          const currentRank = athlete[`current_rank_${discipline}`];
          const tier = seeding?.tier || getTierFromRank(currentRank);
          const defaultPodiumRate = seeding?.defaultPodiumRate || 0.15;
          
          // Set tier
          updates[`strength_tier_${discipline}`] = tier;
          
          // Calculate initial strength score
          const tierBonus = TIER_BONUSES[tier] || 0;
          const strengthScore = calculateStrengthScore(
            defaultPodiumRate,
            defaultPodiumRate * 0.8, // Assume career slightly lower than seeded
            null, // No avg place yet
            tierBonus
          );
          updates[`odds_strength_score_${discipline}`] = strengthScore;
          
          // Calculate fantasy price
          let fantasyPrice: number;
          if (seeding) {
            // Use tier-based pricing for seeded athletes
            fantasyPrice = calculateFantasyPrice(tier, defaultPodiumRate);
          } else if (currentRank) {
            // Use rank-based pricing for ranked athletes
            fantasyPrice = calculatePriceFromRank(currentRank);
          } else {
            // Default for unranked
            fantasyPrice = 3000;
          }
          
          updates[`fantasy_price_${discipline}`] = fantasyPrice;
        }
        
        // Update the athlete
        const { error: updateError } = await supabase
          .from('athletes')
          .update(updates)
          .eq('id', athlete.id);
        
        if (updateError) {
          console.error(`Error updating athlete ${athlete.name}: ${updateError.message}`);
          errors++;
        } else {
          updated++;
          console.log(`Updated ${athlete.name}: tier_slalom=${updates.strength_tier_slalom}, price_slalom=${updates.fantasy_price_slalom}`);
        }
      } catch (err) {
        console.error(`Error processing athlete ${athlete.name}:`, err);
        errors++;
      }
    }
    
    console.log(`Seeding complete: ${updated} updated, ${errors} errors`);
    
    return new Response(
      JSON.stringify({
        success: true,
        updated,
        errors,
        total: athletes?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Seeding error:', errorMessage);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

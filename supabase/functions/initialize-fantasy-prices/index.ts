import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Base price tiers by ranking
const BASE_PRICE_TIERS = {
  ELITE: { minRank: 1, maxRank: 5, minPrice: 15000, maxPrice: 20000 },
  HIGH: { minRank: 6, maxRank: 15, minPrice: 10000, maxPrice: 15000 },
  MEDIUM: { minRank: 16, maxRank: 30, minPrice: 6000, maxPrice: 10000 },
  LOW: { minRank: 31, maxRank: 50, minPrice: 3000, maxPrice: 6000 },
  DEFAULT: { minPrice: 2000, maxPrice: 3000 }
};

function calculateInitialPrice(rank: number | null): number {
  if (!rank) return BASE_PRICE_TIERS.DEFAULT.minPrice;

  if (rank >= BASE_PRICE_TIERS.ELITE.minRank && rank <= BASE_PRICE_TIERS.ELITE.maxRank) {
    const position = rank - BASE_PRICE_TIERS.ELITE.minRank;
    const range = BASE_PRICE_TIERS.ELITE.maxPrice - BASE_PRICE_TIERS.ELITE.minPrice;
    const step = range / (BASE_PRICE_TIERS.ELITE.maxRank - BASE_PRICE_TIERS.ELITE.minRank);
    return Math.round(BASE_PRICE_TIERS.ELITE.maxPrice - (position * step));
  }

  if (rank >= BASE_PRICE_TIERS.HIGH.minRank && rank <= BASE_PRICE_TIERS.HIGH.maxRank) {
    const position = rank - BASE_PRICE_TIERS.HIGH.minRank;
    const range = BASE_PRICE_TIERS.HIGH.maxPrice - BASE_PRICE_TIERS.HIGH.minPrice;
    const step = range / (BASE_PRICE_TIERS.HIGH.maxRank - BASE_PRICE_TIERS.HIGH.minRank);
    return Math.round(BASE_PRICE_TIERS.HIGH.maxPrice - (position * step));
  }

  if (rank >= BASE_PRICE_TIERS.MEDIUM.minRank && rank <= BASE_PRICE_TIERS.MEDIUM.maxRank) {
    const position = rank - BASE_PRICE_TIERS.MEDIUM.minRank;
    const range = BASE_PRICE_TIERS.MEDIUM.maxPrice - BASE_PRICE_TIERS.MEDIUM.minPrice;
    const step = range / (BASE_PRICE_TIERS.MEDIUM.maxRank - BASE_PRICE_TIERS.MEDIUM.minRank);
    return Math.round(BASE_PRICE_TIERS.MEDIUM.maxPrice - (position * step));
  }

  if (rank >= BASE_PRICE_TIERS.LOW.minRank && rank <= BASE_PRICE_TIERS.LOW.maxRank) {
    const position = rank - BASE_PRICE_TIERS.LOW.minRank;
    const range = BASE_PRICE_TIERS.LOW.maxPrice - BASE_PRICE_TIERS.LOW.minPrice;
    const step = range / (BASE_PRICE_TIERS.LOW.maxRank - BASE_PRICE_TIERS.LOW.minRank);
    return Math.round(BASE_PRICE_TIERS.LOW.maxPrice - (position * step));
  }

  return BASE_PRICE_TIERS.DEFAULT.minPrice;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Initializing fantasy prices for all athletes');

    // Get all athletes
    const { data: athletes, error: athletesError } = await supabase
      .from('athletes')
      .select('id, current_rank_slalom, current_rank_trick, current_rank_jump, disciplines');

    if (athletesError) throw athletesError;

    console.log(`Processing ${athletes?.length || 0} athletes`);

    let updated = 0;

    for (const athlete of athletes || []) {
      const updates: Record<string, number> = {};

      // Calculate price for each discipline the athlete competes in
      if (athlete.disciplines.includes('slalom')) {
        updates.fantasy_price_slalom = calculateInitialPrice(athlete.current_rank_slalom);
      }
      if (athlete.disciplines.includes('trick')) {
        updates.fantasy_price_trick = calculateInitialPrice(athlete.current_rank_trick);
      }
      if (athlete.disciplines.includes('jump')) {
        updates.fantasy_price_jump = calculateInitialPrice(athlete.current_rank_jump);
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('athletes')
          .update(updates)
          .eq('id', athlete.id);

        if (updateError) {
          console.error(`Error updating athlete ${athlete.id}:`, updateError);
        } else {
          updated++;
        }
      }
    }

    console.log(`Updated prices for ${updated} athletes`);

    return new Response(JSON.stringify({
      success: true,
      athletes_updated: updated
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in initialize-fantasy-prices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

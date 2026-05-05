import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comprehensive seed data for top Pro Tour athletes
const ATHLETE_SEED_DATA = [
  // MEN'S SLALOM
  { name: "Nate Smith", altNames: ["Smith Nate"], country: "USA", gender: "male", discipline: "slalom", career_wins: 71, career_podiums: 92, pro_tour_titles: 5, base_strength: 99, fantasy_price: 12000, notes: "Most dominant men's slalom skier in history." },
  { name: "Freddie Winter", altNames: ["Winter Freddie"], country: "GBR", gender: "male", discipline: "slalom", career_wins: 12, career_podiums: 52, pro_tour_titles: 1, base_strength: 93, fantasy_price: 10500, notes: "Multiple-time Pro Tour champion." },
  { name: "Will Asher", altNames: ["Asher Will"], country: "GBR", gender: "male", discipline: "slalom", career_wins: 41, career_podiums: 117, pro_tour_titles: 2, base_strength: 92, fantasy_price: 10000, notes: "Veteran world champion." },
  { name: "Thomas Degasperi", altNames: ["Degasperi Thomas"], country: "ITA", gender: "male", discipline: "slalom", career_wins: 18, career_podiums: 73, pro_tour_titles: 2, base_strength: 90, fantasy_price: 9500, notes: "Elite veteran still winning into his 40s." },
  { name: "Robert Hazelwood", altNames: ["Hazelwood Robert"], country: "GBR", gender: "male", discipline: "slalom", career_wins: 1, career_podiums: 10, pro_tour_titles: 0, base_strength: 88, fantasy_price: 9000, notes: "Youngest modern Pro Tour winner." },
  { name: "Cole McCormick", altNames: ["McCormick Cole"], country: "CAN", gender: "male", discipline: "slalom", career_wins: 1, career_podiums: 6, pro_tour_titles: 0, base_strength: 86, fantasy_price: 8800, notes: "New-generation winner." },
  { name: "Charlie Ross", altNames: ["Ross Charlie"], country: "CAN", gender: "male", discipline: "slalom", career_wins: 2, career_podiums: 10, pro_tour_titles: 0, base_strength: 95, fantasy_price: 11000, notes: "Rising star, youngest to run 9.75m." },

  // WOMEN'S SLALOM
  { name: "Regina Jaquess", altNames: ["Jaquess Regina"], country: "USA", gender: "female", discipline: "slalom", career_wins: 65, career_podiums: 94, pro_tour_titles: 4, base_strength: 98, fantasy_price: 12000, notes: "Slalom GOAT with 65 pro wins." },
  { name: "Jaimee Bull", altNames: ["Bull Jaimee"], country: "CAN", gender: "female", discipline: "slalom", career_wins: 16, career_podiums: 42, pro_tour_titles: 2, base_strength: 96, fantasy_price: 11500, notes: "Back-to-back Pro Tour champion." },
  { name: "Manon Costard", altNames: ["Costard Manon"], country: "FRA", gender: "female", discipline: "slalom", career_wins: 12, career_podiums: 52, pro_tour_titles: 1, base_strength: 93, fantasy_price: 10000, notes: "Very consistent finalist." },
  { name: "Whitney McClintock Rini", altNames: ["McClintock Rini Whitney"], country: "CAN", gender: "female", discipline: "slalom", career_wins: 20, career_podiums: 70, pro_tour_titles: 2, base_strength: 92, fantasy_price: 9800, notes: "Multi-time world champion." },
  { name: "Allie Nicholson", altNames: ["Nicholson Allie"], country: "USA", gender: "female", discipline: "slalom", career_wins: 4, career_podiums: 24, pro_tour_titles: 0, base_strength: 88, fantasy_price: 9000, notes: "Emerging top-tier slalomer." },

  // MEN'S TRICK
  { name: "Patricio Font", altNames: ["Font Patricio"], country: "MEX", gender: "male", discipline: "trick", career_wins: 15, career_podiums: 30, pro_tour_titles: 3, base_strength: 97, fantasy_price: 11500, notes: "Multi-time world champion, consistently over 12,000 pts." },
  { name: "Jake Abelson", altNames: ["Abelson Jake"], country: "USA", gender: "male", discipline: "trick", career_wins: 5, career_podiums: 12, pro_tour_titles: 1, base_strength: 99, fantasy_price: 12000, notes: "Next-gen superstar, broke 13,000 points." },
  { name: "Matias Gonzalez", altNames: ["Gonzalez Matias"], country: "CHI", gender: "male", discipline: "trick", career_wins: 2, career_podiums: 8, pro_tour_titles: 0, base_strength: 90, fantasy_price: 9000, notes: "High 10k–11k scorer." },
  { name: "Louis Duplan-Fribourg", altNames: ["Duplan-Fribourg Louis"], country: "FRA", gender: "male", discipline: "trick", career_wins: 3, career_podiums: 12, pro_tour_titles: 0, base_strength: 89, fantasy_price: 8800, notes: "Strong 2022–23 seasons." },
  { name: "Dorien Llewellyn", altNames: ["Llewellyn Dorien"], country: "CAN", gender: "male", discipline: "trick", career_wins: 4, career_podiums: 15, pro_tour_titles: 0, base_strength: 88, fantasy_price: 8600, notes: "Overall star with multiple trick podiums." },

  // WOMEN'S TRICK
  { name: "Erika Lang", altNames: ["Lang Erika"], country: "USA", gender: "female", discipline: "trick", career_wins: 20, career_podiums: 40, pro_tour_titles: 3, base_strength: 99, fantasy_price: 12000, notes: "Current women's trick world record holder." },
  { name: "Anna Gay", altNames: ["Gay Anna"], country: "USA", gender: "female", discipline: "trick", career_wins: 9, career_podiums: 16, pro_tour_titles: 1, base_strength: 97, fantasy_price: 11500, notes: "Former world record holder." },
  { name: "Neilly Ross", altNames: ["Ross Neilly"], country: "CAN", gender: "female", discipline: "trick", career_wins: 4, career_podiums: 15, pro_tour_titles: 0, base_strength: 95, fantasy_price: 11000, notes: "Consistent top-3." },
  { name: "Giannina Bonnemann", altNames: ["Bonnemann Giannina"], country: "GER", gender: "female", discipline: "trick", career_wins: 3, career_podiums: 12, pro_tour_titles: 0, base_strength: 92, fantasy_price: 10000, notes: "Always in the mix." },

  // MEN'S JUMP
  { name: "Freddy Krueger", altNames: ["Krueger Freddy"], country: "USA", gender: "male", discipline: "jump", career_wins: 65, career_podiums: 94, pro_tour_titles: 5, base_strength: 97, fantasy_price: 11500, notes: "Jump legend, world record holder in ski flying." },
  { name: "Joel Poland", altNames: ["Poland Joel"], country: "GBR", gender: "male", discipline: "jump", career_wins: 6, career_podiums: 15, pro_tour_titles: 1, base_strength: 99, fantasy_price: 12000, notes: "2025 season: undefeated in Pro Tour jump events." },
  { name: "Ryan Dodd", altNames: ["Dodd Ryan"], country: "CAN", gender: "male", discipline: "jump", career_wins: 20, career_podiums: 40, pro_tour_titles: 3, base_strength: 96, fantasy_price: 11200, notes: "Multiple-time world champion." },
  { name: "Jack Critchley", altNames: ["Critchley Jack"], country: "GBR", gender: "male", discipline: "jump", career_wins: 4, career_podiums: 12, pro_tour_titles: 0, base_strength: 92, fantasy_price: 9800, notes: "Multiple Pro Tour wins." },
  { name: "Luca Rauchenwald", altNames: ["Rauchenwald Luca"], country: "AUT", gender: "male", discipline: "jump", career_wins: 2, career_podiums: 10, pro_tour_titles: 0, base_strength: 90, fantasy_price: 9500, notes: "Climbed into top-3 rankings by 2025." },

  // WOMEN'S JUMP
  { name: "Jacinta Carroll", altNames: ["Carroll Jacinta"], country: "AUS", gender: "female", discipline: "jump", career_wins: 40, career_podiums: 50, pro_tour_titles: 5, base_strength: 100, fantasy_price: 0, notes: "Most dominant women's jumper. RETIRED.", is_retired: true },
  { name: "Hanna Straltsova", altNames: ["Straltsova Hanna"], country: "BLR", gender: "female", discipline: "jump", career_wins: 15, career_podiums: 30, pro_tour_titles: 2, base_strength: 99, fantasy_price: 12000, notes: "Now #1 women's jumper, dominated 2024–25." },
  { name: "Brittany Greenwood", altNames: ["Greenwood Brittany", "Greenwood-Wharton Brittany"], country: "USA", gender: "female", discipline: "jump", career_wins: 3, career_podiums: 15, pro_tour_titles: 0, base_strength: 94, fantasy_price: 10500, notes: "Only other woman besides Hanna to win in 2025." },
  { name: "Lauren Morgan", altNames: ["Morgan Lauren"], country: "USA", gender: "female", discipline: "jump", career_wins: 3, career_podiums: 20, pro_tour_titles: 0, base_strength: 90, fantasy_price: 0, notes: "Long-time podium skier. RETIRED.", is_retired: true },
  { name: "Aliaksandra Danisheuskaya", altNames: ["Danisheuskaya Aliaksandra", "Sasha Danisheuskaya"], country: "BLR", gender: "female", discipline: "jump", career_wins: 1, career_podiums: 8, pro_tour_titles: 0, base_strength: 90, fantasy_price: 9500, notes: "Consistent finals and podium threat. Ranked #3." }
];

interface SeedData {
  name: string;
  altNames?: string[];
  country: string;
  gender: string;
  discipline: string;
  career_wins: number;
  career_podiums: number;
  pro_tour_titles: number;
  base_strength: number;
  fantasy_price: number;
  notes: string;
  is_retired?: boolean;
}

// Helper to match athlete names (handles First Last vs Last First)
function matchAthleteByName(athleteName: string, seedData: SeedData): boolean {
  const normalizedName = athleteName.toLowerCase().trim();
  
  if (seedData.name.toLowerCase() === normalizedName) return true;
  if (seedData.altNames?.some(alt => alt.toLowerCase() === normalizedName)) return true;
  
  // Fuzzy: check all parts match
  const seedParts = seedData.name.toLowerCase().split(' ');
  const inputParts = normalizedName.split(' ');
  
  if (seedParts.length !== inputParts.length) return false;
  
  return seedParts.every(part => 
    inputParts.some(inputPart => inputPart === part || inputPart.includes(part))
  );
}

// Map rating to fantasy price
function ratingToFantasyPrice(rating: number): number {
  if (rating >= 97) return 12000;
  if (rating >= 95) return 11000;
  if (rating >= 92) return 10000;
  if (rating >= 90) return 9500;
  if (rating >= 87) return 9000;
  if (rating >= 85) return 8500;
  if (rating >= 82) return 8000;
  if (rating >= 80) return 7500;
  if (rating >= 77) return 7000;
  if (rating >= 75) return 6500;
  if (rating >= 72) return 6000;
  if (rating >= 70) return 5500;
  return 5000;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting comprehensive athlete stats seeding...');

    // Fetch all athletes
    const { data: athletes, error: fetchError } = await supabase
      .from('athletes')
      .select('*');

    if (fetchError) {
      throw new Error(`Failed to fetch athletes: ${fetchError.message}`);
    }

    console.log(`Found ${athletes?.length || 0} athletes to process`);

    const results = {
      updated: 0,
      matched: 0,
      errors: [] as string[]
    };

    for (const athlete of athletes || []) {
      try {
        const updateData: Record<string, unknown> = {};
        const disciplines = ['slalom', 'trick', 'jump'] as const;

        for (const discipline of disciplines) {
          // Find matching seed data
          const seed = ATHLETE_SEED_DATA.find(s => 
            s.discipline === discipline && 
            s.gender === athlete.gender &&
            matchAthleteByName(athlete.name, s)
          );

          if (seed) {
            results.matched++;
            console.log(`Matched ${athlete.name} to seed data for ${discipline}`);
            
            // Set career stats
            updateData[`career_wins_${discipline}`] = seed.career_wins;
            updateData[`career_podiums_${discipline}`] = seed.career_podiums;
            updateData[`pro_tour_titles_${discipline}`] = seed.pro_tour_titles;
            
            // Set strength ratings
            updateData[`base_strength_${discipline}`] = seed.base_strength;
            updateData[`current_rating_${discipline}`] = seed.base_strength; // Initial = base
            updateData[`form_boost_${discipline}`] = 0;
            updateData[`activity_decay_${discipline}`] = 0;
            
            // Set fantasy price from seed or calculate
            updateData[`fantasy_price_${discipline}`] = seed.fantasy_price || ratingToFantasyPrice(seed.base_strength);
            
            // Calculate odds strength score (normalized 0-1)
            updateData[`odds_strength_score_${discipline}`] = seed.base_strength / 100;
            
            // Set tier based on strength
            if (seed.base_strength >= 95) {
              updateData[`strength_tier_${discipline}`] = 'tier1';
            } else if (seed.base_strength >= 88) {
              updateData[`strength_tier_${discipline}`] = 'tier2';
            } else if (seed.base_strength >= 80) {
              updateData[`strength_tier_${discipline}`] = 'tier3';
            } else {
              updateData[`strength_tier_${discipline}`] = 'unranked';
            }
            
            // Set notes and retired status
            if (seed.notes) {
              updateData.notes = seed.notes;
            }
            if (seed.is_retired) {
              updateData.is_retired = true;
            }
          } else {
            // No seed data - use rank-based defaults
            const rank = athlete[`current_rank_${discipline}`] as number | null;
            
            let baseStrength = 70;
            if (rank && rank <= 3) baseStrength = 90;
            else if (rank && rank <= 5) baseStrength = 85;
            else if (rank && rank <= 10) baseStrength = 80;
            else if (rank && rank <= 20) baseStrength = 75;
            
            updateData[`base_strength_${discipline}`] = baseStrength;
            updateData[`current_rating_${discipline}`] = baseStrength;
            updateData[`odds_strength_score_${discipline}`] = baseStrength / 100;
            updateData[`fantasy_price_${discipline}`] = ratingToFantasyPrice(baseStrength);
          }
        }

        // Update athlete
        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from('athletes')
            .update(updateData)
            .eq('id', athlete.id);

          if (updateError) {
            results.errors.push(`${athlete.name}: ${updateError.message}`);
          } else {
            results.updated++;
          }
        }
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`${athlete.name}: ${errMessage}`);
      }
    }

    console.log(`Seeding complete: ${results.updated} updated, ${results.matched} matched to seed data`);

    return new Response(JSON.stringify({
      success: true,
      message: `Updated ${results.updated} athletes, matched ${results.matched} to seed data`,
      errors: results.errors.length > 0 ? results.errors : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Seed athlete stats error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Hardcoded tier seeding for known elite athletes
// Format: athlete name (as stored in DB) -> discipline config

export type TierLevel = 'tier1' | 'tier2' | 'tier3' | 'unranked';

export interface AthleteSeeding {
  discipline: 'slalom' | 'trick' | 'jump';
  gender: 'male' | 'female';
  tier: TierLevel;
  defaultPodiumRate: number;
}

// Key format: "Name" (exact match with athletes table name field)
export const ATHLETE_TIER_SEEDS: Record<string, AthleteSeeding[]> = {
  // ============ MEN'S SLALOM ============
  'Nate Smith': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.80 }],
  'Smith Nate': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.80 }],
  'Charlie Ross': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Ross Charlie': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Will Asher': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Asher Will': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Freddie Winter': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.55 }],
  'Winter Freddie': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.55 }],
  'Thomas Degasperi': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.50 }],
  'Degasperi Thomas': [{ discipline: 'slalom', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.50 }],
  
  // Men's Slalom Tier 2
  'Joel Poland': [{ discipline: 'slalom', gender: 'male', tier: 'tier2', defaultPodiumRate: 0.35 }],
  'Piotr Chmielewski': [{ discipline: 'slalom', gender: 'male', tier: 'tier2', defaultPodiumRate: 0.30 }],
  'Martin Kolman': [{ discipline: 'slalom', gender: 'male', tier: 'tier2', defaultPodiumRate: 0.30 }],
  
  // ============ WOMEN'S SLALOM ============
  'Regina Jaquess': [{ discipline: 'slalom', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.85 }],
  'Jaquess Regina': [{ discipline: 'slalom', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.85 }],
  'Whitney McClintock Rini': [{ discipline: 'slalom', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Whitney McClintock': [{ discipline: 'slalom', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Jaimee Bull': [{ discipline: 'slalom', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Bull Jaimee': [{ discipline: 'slalom', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Manon Costard': [{ discipline: 'slalom', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.55 }],
  'Costard Manon': [{ discipline: 'slalom', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.55 }],
  
  // ============ MEN'S TRICK ============
  'Patricio Font': [{ discipline: 'trick', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Font Patricio': [{ discipline: 'trick', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Aliaksei Zharnasek': [{ discipline: 'trick', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Zharnasek Aliaksei': [{ discipline: 'trick', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Adam Pickos': [{ discipline: 'trick', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Pickos Adam': [{ discipline: 'trick', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.60 }],
  
  // Men's Trick Tier 2
  'Rodrigo Miranda': [{ discipline: 'trick', gender: 'male', tier: 'tier2', defaultPodiumRate: 0.40 }],
  'Miranda Rodrigo': [{ discipline: 'trick', gender: 'male', tier: 'tier2', defaultPodiumRate: 0.40 }],
  
  // ============ WOMEN'S TRICK ============
  'Erika Lang': [{ discipline: 'trick', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.75 }],
  'Lang Erika': [{ discipline: 'trick', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.75 }],
  'Anna Gay': [{ discipline: 'trick', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Gay Anna': [{ discipline: 'trick', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Neilly Ross': [{ discipline: 'trick', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Ross Neilly': [{ discipline: 'trick', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.60 }],
  'Giannina Bonnemann': [{ discipline: 'trick', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.55 }],
  'Bonnemann Giannina': [{ discipline: 'trick', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.55 }],
  
  // ============ MEN'S JUMP ============
  'Freddy Krueger': [{ discipline: 'jump', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Krueger Freddy': [{ discipline: 'jump', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.70 }],
  'Ryan Dodd': [{ discipline: 'jump', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.65 }],
  'Dodd Ryan': [{ discipline: 'jump', gender: 'male', tier: 'tier1', defaultPodiumRate: 0.65 }],
  
  // Men's Jump Tier 2
  'Louis Duplan-Fribourg': [{ discipline: 'jump', gender: 'male', tier: 'tier2', defaultPodiumRate: 0.40 }],
  'Igor Morozov': [{ discipline: 'jump', gender: 'male', tier: 'tier2', defaultPodiumRate: 0.35 }],
  'Morozov Igor': [{ discipline: 'jump', gender: 'male', tier: 'tier2', defaultPodiumRate: 0.35 }],
  
  // ============ WOMEN'S JUMP ============
  'Hanna Straltsova': [{ discipline: 'jump', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.80 }],
  'Straltsova Hanna': [{ discipline: 'jump', gender: 'female', tier: 'tier1', defaultPodiumRate: 0.80 }],
  // Jacinta Carroll - RETIRED, not tier1 for 2025+
  'Jacinta Carroll': [{ discipline: 'jump', gender: 'female', tier: 'tier2', defaultPodiumRate: 0.30 }],
  'Carroll Jacinta': [{ discipline: 'jump', gender: 'female', tier: 'tier2', defaultPodiumRate: 0.30 }],
};

// Tier bonuses for strength score calculation
export const TIER_BONUSES: Record<TierLevel, number> = {
  tier1: 0.15,
  tier2: 0.07,
  tier3: 0.03,
  unranked: 0,
};

/**
 * Get tier seeding for an athlete by name and discipline
 */
export const getAthleteTierSeeding = (
  athleteName: string,
  discipline: 'slalom' | 'trick' | 'jump',
  gender: 'male' | 'female'
): { tier: TierLevel; defaultPodiumRate: number } => {
  const seedings = ATHLETE_TIER_SEEDS[athleteName];
  
  if (seedings) {
    const match = seedings.find(s => s.discipline === discipline && s.gender === gender);
    if (match) {
      return { tier: match.tier, defaultPodiumRate: match.defaultPodiumRate };
    }
  }
  
  return { tier: 'unranked', defaultPodiumRate: 0.15 };
};

/**
 * Get tier bonus for strength calculation
 */
export const getTierBonus = (tier: TierLevel): number => {
  return TIER_BONUSES[tier];
};

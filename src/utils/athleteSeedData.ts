/**
 * Comprehensive Athlete Seed Data for Odds Engine + Fantasy Pricing
 * 
 * This data seeds the baseline stats for top Pro Tour athletes.
 * The system will learn and adjust from tournament results.
 */

export interface AthleteSeeding {
  name: string;
  alternateNames?: string[]; // For matching different name formats
  country: string;
  gender: 'male' | 'female';
  discipline: 'slalom' | 'trick' | 'jump';
  career_wins: number;
  career_podiums: number;
  pro_tour_titles: number;
  notes: string;
  base_strength: number; // 0-100 scale
  fantasy_price: number;
  is_retired?: boolean;
}

export const ATHLETE_SEED_DATA: AthleteSeeding[] = [
  // ==================== MEN'S SLALOM ====================
  {
    name: "Nate Smith",
    alternateNames: ["Smith Nate"],
    country: "USA",
    gender: "male",
    discipline: "slalom",
    career_wins: 71,
    career_podiums: 92,
    pro_tour_titles: 5,
    notes: "Most dominant men's slalom skier in history. ~75% win rate over the last decade, routinely running into 9.75m/43off.",
    base_strength: 99,
    fantasy_price: 12000
  },
  {
    name: "Freddie Winter",
    alternateNames: ["Winter Freddie", "Frederick Winter"],
    country: "GBR",
    gender: "male",
    discipline: "slalom",
    career_wins: 12,
    career_podiums: 52,
    pro_tour_titles: 1,
    notes: "Multiple-time Pro Tour champion, extremely consistent finalist with several 2023–24 titles.",
    base_strength: 93,
    fantasy_price: 10500
  },
  {
    name: "Will Asher",
    alternateNames: ["Asher Will", "William Asher"],
    country: "GBR",
    gender: "male",
    discipline: "slalom",
    career_wins: 41,
    career_podiums: 117,
    pro_tour_titles: 2,
    notes: "Veteran world champion, historically top 2–3 in the world for many years.",
    base_strength: 92,
    fantasy_price: 10000
  },
  {
    name: "Thomas Degasperi",
    alternateNames: ["Degasperi Thomas"],
    country: "ITA",
    gender: "male",
    discipline: "slalom",
    career_wins: 18,
    career_podiums: 73,
    pro_tour_titles: 2,
    notes: "Elite veteran still winning into his 40s, very high finals and podium rate.",
    base_strength: 90,
    fantasy_price: 9500
  },
  {
    name: "Robert Hazelwood",
    alternateNames: ["Hazelwood Robert", "Rob Hazelwood"],
    country: "GBR",
    gender: "male",
    discipline: "slalom",
    career_wins: 1,
    career_podiums: 10,
    pro_tour_titles: 0,
    notes: "First pro win at Lake 38 Pro-Am 2024, youngest modern Pro Tour winner. High finals rate in 2023–24 (over 50%).",
    base_strength: 88,
    fantasy_price: 9000
  },
  {
    name: "Cole McCormick",
    alternateNames: ["McCormick Cole"],
    country: "CAN",
    gender: "male",
    discipline: "slalom",
    career_wins: 1,
    career_podiums: 6,
    pro_tour_titles: 0,
    notes: "New-generation winner (Masters + Pro stops), strong recent form.",
    base_strength: 86,
    fantasy_price: 8800
  },
  {
    name: "Charlie Ross",
    alternateNames: ["Ross Charlie"],
    country: "CAN",
    gender: "male",
    discipline: "slalom",
    career_wins: 2,
    career_podiums: 10,
    pro_tour_titles: 0,
    notes: "Rising star. Multiple 2025 podiums, Moomba + Monaco titles, youngest to run 9.75m. Roughly 70% podium rate in 2025 season.",
    base_strength: 95,
    fantasy_price: 11000
  },

  // ==================== WOMEN'S SLALOM ====================
  {
    name: "Regina Jaquess",
    alternateNames: ["Jaquess Regina"],
    country: "USA",
    gender: "female",
    discipline: "slalom",
    career_wins: 65,
    career_podiums: 94,
    pro_tour_titles: 4,
    notes: "Slalom GOAT. 65 pro slalom wins, still winning multiple Pro Tour stops per year.",
    base_strength: 98,
    fantasy_price: 12000
  },
  {
    name: "Jaimee Bull",
    alternateNames: ["Bull Jaimee"],
    country: "CAN",
    gender: "female",
    discipline: "slalom",
    career_wins: 16,
    career_podiums: 42,
    pro_tour_titles: 2,
    notes: "Back-to-back Pro Tour champion, frequent 10.75m–10.25m scores, 2024–25 slalom leader.",
    base_strength: 96,
    fantasy_price: 11500
  },
  {
    name: "Manon Costard",
    alternateNames: ["Costard Manon"],
    country: "FRA",
    gender: "female",
    discipline: "slalom",
    career_wins: 12,
    career_podiums: 52,
    pro_tour_titles: 1,
    notes: "Very consistent finalist. High podium count with strong 2023–24 results.",
    base_strength: 93,
    fantasy_price: 10000
  },
  {
    name: "Whitney McClintock Rini",
    alternateNames: ["McClintock Rini Whitney", "Whitney McClintock"],
    country: "CAN",
    gender: "female",
    discipline: "slalom",
    career_wins: 20,
    career_podiums: 70,
    pro_tour_titles: 2,
    notes: "Multi-time world champion, slightly past peak but still a podium force.",
    base_strength: 92,
    fantasy_price: 9800
  },
  {
    name: "Allie Nicholson",
    alternateNames: ["Nicholson Allie", "Allison Nicholson"],
    country: "USA",
    gender: "female",
    discipline: "slalom",
    career_wins: 4,
    career_podiums: 24,
    pro_tour_titles: 0,
    notes: "Emerging top-tier slalomer, frequent finalist with several 2023–24 podiums.",
    base_strength: 88,
    fantasy_price: 9000
  },

  // ==================== MEN'S TRICK ====================
  {
    name: "Patricio Font",
    alternateNames: ["Font Patricio"],
    country: "MEX",
    gender: "male",
    discipline: "trick",
    career_wins: 15,
    career_podiums: 30,
    pro_tour_titles: 3,
    notes: "Multi-time world champion, consistently over 12,000 pts, dominated 2019–2023.",
    base_strength: 97,
    fantasy_price: 11500
  },
  {
    name: "Jake Abelson",
    alternateNames: ["Abelson Jake"],
    country: "USA",
    gender: "male",
    discipline: "trick",
    career_wins: 5,
    career_podiums: 12,
    pro_tour_titles: 1,
    notes: "Next-gen superstar. Broke 13,000 points in 2024–25, won most major 2025 events.",
    base_strength: 99,
    fantasy_price: 12000
  },
  {
    name: "Matias Gonzalez",
    alternateNames: ["Gonzalez Matias"],
    country: "CHI",
    gender: "male",
    discipline: "trick",
    career_wins: 2,
    career_podiums: 8,
    pro_tour_titles: 0,
    notes: "High 10k–11k scorer, regular finalist and podium threat.",
    base_strength: 90,
    fantasy_price: 9000
  },
  {
    name: "Louis Duplan-Fribourg",
    alternateNames: ["Duplan-Fribourg Louis"],
    country: "FRA",
    gender: "male",
    discipline: "trick",
    career_wins: 3,
    career_podiums: 12,
    pro_tour_titles: 0,
    notes: "Strong 2022–23 seasons, consistent finals in tricks.",
    base_strength: 89,
    fantasy_price: 8800
  },
  {
    name: "Dorien Llewellyn",
    alternateNames: ["Llewellyn Dorien"],
    country: "CAN",
    gender: "male",
    discipline: "trick",
    career_wins: 4,
    career_podiums: 15,
    pro_tour_titles: 0,
    notes: "Overall star with multiple trick podiums, big-swing potential but more variance.",
    base_strength: 88,
    fantasy_price: 8600
  },

  // ==================== WOMEN'S TRICK ====================
  {
    name: "Erika Lang",
    alternateNames: ["Lang Erika"],
    country: "USA",
    gender: "female",
    discipline: "trick",
    career_wins: 20,
    career_podiums: 40,
    pro_tour_titles: 3,
    notes: "Current women's trick world record holder (~11,450 pts). Frequent Pro Tour winner.",
    base_strength: 99,
    fantasy_price: 12000
  },
  {
    name: "Anna Gay",
    alternateNames: ["Gay Anna"],
    country: "USA",
    gender: "female",
    discipline: "trick",
    career_wins: 9,
    career_podiums: 16,
    pro_tour_titles: 1,
    notes: "Former world record holder, extremely high podium percentage (~80%).",
    base_strength: 97,
    fantasy_price: 11500
  },
  {
    name: "Neilly Ross",
    alternateNames: ["Ross Neilly"],
    country: "CAN",
    gender: "female",
    discipline: "trick",
    career_wins: 4,
    career_podiums: 15,
    pro_tour_titles: 0,
    notes: "Consistent top-3, scored a pending world record in 2024.",
    base_strength: 95,
    fantasy_price: 11000
  },
  {
    name: "Giannina Bonnemann",
    alternateNames: ["Bonnemann Giannina"],
    country: "GER",
    gender: "female",
    discipline: "trick",
    career_wins: 3,
    career_podiums: 12,
    pro_tour_titles: 0,
    notes: "Always in the mix, multiple wins and frequent finals.",
    base_strength: 92,
    fantasy_price: 10000
  },

  // ==================== MEN'S JUMP ====================
  {
    name: "Freddy Krueger",
    alternateNames: ["Krueger Freddy", "Fred Krueger"],
    country: "USA",
    gender: "male",
    discipline: "jump",
    career_wins: 65,
    career_podiums: 94,
    pro_tour_titles: 5,
    notes: "Jump legend. Has won at least one pro event almost every year since mid-90s. World record holder in ski flying.",
    base_strength: 97,
    fantasy_price: 11500
  },
  {
    name: "Joel Poland",
    alternateNames: ["Poland Joel"],
    country: "GBR",
    gender: "male",
    discipline: "jump",
    career_wins: 6,
    career_podiums: 15,
    pro_tour_titles: 1,
    notes: "2025 season: undefeated in Pro Tour jump events. Also world overall record holder.",
    base_strength: 99,
    fantasy_price: 12000
  },
  {
    name: "Ryan Dodd",
    alternateNames: ["Dodd Ryan"],
    country: "CAN",
    gender: "male",
    discipline: "jump",
    career_wins: 20,
    career_podiums: 40,
    pro_tour_titles: 3,
    notes: "Multiple-time world champion, huge distances, still winning majors post-2020.",
    base_strength: 96,
    fantasy_price: 11200
  },
  {
    name: "Jack Critchley",
    alternateNames: ["Critchley Jack"],
    country: "GBR",
    gender: "male",
    discipline: "jump",
    career_wins: 4,
    career_podiums: 12,
    pro_tour_titles: 0,
    notes: "Multiple Pro Tour wins, very high finals rate.",
    base_strength: 92,
    fantasy_price: 9800
  },
  {
    name: "Luca Rauchenwald",
    alternateNames: ["Rauchenwald Luca"],
    country: "AUT",
    gender: "male",
    discipline: "jump",
    career_wins: 2,
    career_podiums: 10,
    pro_tour_titles: 0,
    notes: "Climbed into top-3 rankings by 2025 through consistency and big jumps.",
    base_strength: 90,
    fantasy_price: 9500
  },

  // ==================== WOMEN'S JUMP ====================
  {
    name: "Jacinta Carroll",
    alternateNames: ["Carroll Jacinta"],
    country: "AUS",
    gender: "female",
    discipline: "jump",
    career_wins: 40,
    career_podiums: 50,
    pro_tour_titles: 5,
    notes: "Most dominant women's jumper in history. 37 consecutive pro wins. RETIRED – do not include in future events.",
    base_strength: 100,
    fantasy_price: 0,
    is_retired: true
  },
  {
    name: "Hanna Straltsova",
    alternateNames: ["Straltsova Hanna", "Straltsova Hanna"],
    country: "BLR",
    gender: "female",
    discipline: "jump",
    career_wins: 15,
    career_podiums: 30,
    pro_tour_titles: 2,
    notes: "Now the #1 women's jumper. Dominated 2024–25, effectively undefeated post-Jacinta.",
    base_strength: 99,
    fantasy_price: 12000
  },
  {
    name: "Brittany Greenwood",
    alternateNames: ["Greenwood Brittany", "Greenwood-Wharton Brittany"],
    country: "USA",
    gender: "female",
    discipline: "jump",
    career_wins: 3,
    career_podiums: 15,
    pro_tour_titles: 0,
    notes: "Only other woman besides Hanna to win in 2025. Frequent 2nd-place finisher.",
    base_strength: 94,
    fantasy_price: 10500
  },
  {
    name: "Lauren Morgan",
    alternateNames: ["Morgan Lauren"],
    country: "USA",
    gender: "female",
    discipline: "jump",
    career_wins: 3,
    career_podiums: 20,
    pro_tour_titles: 0,
    notes: "Long-time podium skier, retired in 2025. Use only in legacy/history, not future events.",
    base_strength: 90,
    fantasy_price: 0,
    is_retired: true
  },
  {
    name: "Aliaksandra Danisheuskaya",
    alternateNames: ["Danisheuskaya Aliaksandra", "Sasha Danisheuskaya"],
    country: "BLR",
    gender: "female",
    discipline: "jump",
    career_wins: 1,
    career_podiums: 8,
    pro_tour_titles: 0,
    notes: "Consistent finals and podium threat. Ranked #3 in many 2025 lists.",
    base_strength: 90,
    fantasy_price: 9500
  }
];

/**
 * Find seed data for an athlete by name (handles different name formats)
 */
export const findAthleteSeedData = (
  athleteName: string,
  discipline: 'slalom' | 'trick' | 'jump',
  gender: 'male' | 'female'
): AthleteSeeding | undefined => {
  const normalizedName = athleteName.toLowerCase().trim();
  
  return ATHLETE_SEED_DATA.find(seed => {
    if (seed.discipline !== discipline || seed.gender !== gender) return false;
    
    // Check main name
    if (seed.name.toLowerCase() === normalizedName) return true;
    
    // Check alternate names
    if (seed.alternateNames?.some(alt => alt.toLowerCase() === normalizedName)) return true;
    
    // Fuzzy match: check if all parts of one name exist in the other
    const seedParts = seed.name.toLowerCase().split(' ');
    const inputParts = normalizedName.split(' ');
    
    const allSeedPartsMatch = seedParts.every(part => 
      inputParts.some(inputPart => inputPart.includes(part) || part.includes(inputPart))
    );
    
    return allSeedPartsMatch && seedParts.length === inputParts.length;
  });
};

/**
 * Get default seed data for unranked athletes
 */
export const getDefaultSeedData = (
  discipline: 'slalom' | 'trick' | 'jump',
  gender: 'male' | 'female'
): Partial<AthleteSeeding> => ({
  discipline,
  gender,
  career_wins: 0,
  career_podiums: 0,
  pro_tour_titles: 0,
  notes: '',
  base_strength: 70,
  fantasy_price: 5000,
  is_retired: false
});

/**
 * Map current_rating to fantasy price tier
 */
export const ratingToFantasyPrice = (rating: number): number => {
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
};

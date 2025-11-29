// Waterski scoring utilities for slalom, trick, and jump

export type Discipline = 'slalom' | 'trick' | 'jump';

// Rope difficulty hierarchy (easiest to hardest)
// Each rope can have multiple notations (off values or meters)
const ROPE_HIERARCHY = [
  ['15', '18.25'],
  ['22', '16'],
  ['28', '14.25'],
  ['32', '13'],
  ['35', '12.2'],
  ['38', '11.25'],
  ['39.5', '10.75'],
  ['41', '10.25'],
  ['43', '9.75']
];

// Flatten for easy lookup
const ROPE_LOOKUP = new Map<string, number>();
ROPE_HIERARCHY.forEach((variations, index) => {
  variations.forEach(rope => {
    ROPE_LOOKUP.set(rope, index);
  });
});

/**
 * Parse slalom score format (e.g., "2@43", "3.5@41", "3 1/2@41", "½@38")
 * Returns: { buoys: number, rope: string, value: number }
 */
export function parseSlalomScore(scoreStr: string): { buoys: number; rope: string; value: number } | null {
  if (!scoreStr || typeof scoreStr !== 'string') return null;
  
  const trimmed = scoreStr.trim();
  const parts = trimmed.split('@');
  
  if (parts.length !== 2) return null;
  
  const buoyPart = parts[0].trim();
  const rope = parts[1].trim();
  
  // Convert buoy string to decimal
  let buoys = 0;
  
  // Handle fractions
  if (buoyPart.includes('½') || buoyPart === '1/2') {
    buoys = 0.5;
  } else if (buoyPart.includes('¼') || buoyPart === '1/4') {
    buoys = 0.25;
  } else if (buoyPart.includes('¾') || buoyPart === '3/4') {
    buoys = 0.75;
  } else if (buoyPart.includes('/')) {
    // Handle other fractions like "1/2", "3/4", etc.
    const [num, denom] = buoyPart.split('/').map(x => parseFloat(x.trim()));
    if (num && denom) {
      buoys = num / denom;
    }
  } else if (buoyPart.includes(' ')) {
    // Handle mixed numbers like "3 1/2"
    const mixedParts = buoyPart.split(' ');
    const whole = parseFloat(mixedParts[0]) || 0;
    const fractionStr = mixedParts[1];
    
    if (fractionStr.includes('/')) {
      const [num, denom] = fractionStr.split('/').map(x => parseFloat(x.trim()));
      if (num && denom) {
        buoys = whole + (num / denom);
      }
    } else {
      buoys = whole;
    }
  } else {
    // Plain decimal or integer
    buoys = parseFloat(buoyPart) || 0;
  }
  
  // Calculate value: rope_index * 10 + buoys
  const ropeIndex = ROPE_LOOKUP.get(rope);
  if (ropeIndex === undefined) return null;
  
  const value = ropeIndex * 10 + buoys;
  
  return { buoys, rope, value };
}

/**
 * Compare two slalom scores
 * Returns: positive if score1 > score2, negative if score1 < score2, 0 if equal
 */
export function compareSlalomScores(score1Str: string, score2Str: string): number {
  const parsed1 = parseSlalomScore(score1Str);
  const parsed2 = parseSlalomScore(score2Str);
  
  if (!parsed1 && !parsed2) return 0;
  if (!parsed1) return -1;
  if (!parsed2) return 1;
  
  return parsed1.value - parsed2.value;
}

/**
 * Compare scores based on discipline type
 */
export function compareScores(
  score1: string | number,
  score2: string | number,
  discipline: Discipline
): number {
  if (discipline === 'slalom') {
    return compareSlalomScores(String(score1), String(score2));
  }
  
  // For trick and jump, higher numeric value is better
  const num1 = typeof score1 === 'number' ? score1 : parseFloat(String(score1)) || 0;
  const num2 = typeof score2 === 'number' ? score2 : parseFloat(String(score2)) || 0;
  
  return num1 - num2;
}

/**
 * Sort results by score (best to worst) for a given discipline
 */
export function sortResultsByScore<T extends { score: string | number }>(
  results: T[],
  discipline: Discipline
): T[] {
  return [...results].sort((a, b) => compareScores(b.score, a.score, discipline));
}

/**
 * Validate slalom score format
 */
export function isValidSlalomScore(scoreStr: string): boolean {
  return parseSlalomScore(scoreStr) !== null;
}

/**
 * Normalize slalom score for display (e.g., convert "3 1/2@41" to "3.5@41")
 */
export function normalizeSlalomScore(scoreStr: string): string {
  const parsed = parseSlalomScore(scoreStr);
  if (!parsed) return scoreStr;
  
  return `${parsed.buoys}@${parsed.rope}`;
}

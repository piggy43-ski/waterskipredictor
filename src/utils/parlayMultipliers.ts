import { ParlayLeg } from '@/types/parlay';

/**
 * Fixed multiplier rules:
 * - 1 leg (1 discipline, 1 gender): 20x
 * - 2 legs (same discipline, both genders): 50x
 * - 2 disciplines, 1 gender: 50x
 * - 2 disciplines, both genders: 100x
 * - 3 disciplines, 1 gender: 100x
 * - 3 disciplines, both genders: 200x
 */
export function calculateParlayMultiplier(legs: ParlayLeg[]): number {
  if (legs.length === 0) return 0;

  const disciplines = new Set(legs.map(l => l.discipline));
  const genders = new Set(legs.map(l => l.gender));

  const disciplineCount = disciplines.size;
  const genderCount = genders.size;

  if (disciplineCount === 3 && genderCount === 2) return 200;
  if (disciplineCount === 3 && genderCount === 1) return 100;
  if (disciplineCount === 2 && genderCount === 2) return 100;
  if (disciplineCount === 2 && genderCount === 1) return 50;
  if (disciplineCount === 1 && genderCount === 2) return 50;
  
  return 20; // Default: 1 discipline, 1 gender
}

/**
 * Get suggestions for increasing the multiplier
 */
export function getMultiplierSuggestions(legs: ParlayLeg[], availableDisciplines: string[]): string[] {
  const disciplines = new Set(legs.map(l => l.discipline));
  const genders = new Set(legs.map(l => l.gender));
  const suggestions: string[] = [];

  const currentMultiplier = calculateParlayMultiplier(legs);

  // Suggest adding other gender for same discipline
  if (genders.size === 1) {
    const otherGender = genders.has('men') ? 'Women' : 'Men';
    const currentDiscipline = legs[0].discipline;
    const disciplineName = currentDiscipline.charAt(0).toUpperCase() + currentDiscipline.slice(1);
    suggestions.push(`Add ${otherGender}'s ${disciplineName} to reach ${currentMultiplier === 20 ? 50 : currentMultiplier === 100 ? 200 : 100}x`);
  }

  // Suggest adding more disciplines
  const unusedDisciplines = availableDisciplines.filter(d => !disciplines.has(d as any));
  if (unusedDisciplines.length > 0 && disciplines.size < 3) {
    const disciplineNames = unusedDisciplines.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(' & ');
    const targetMultiplier = disciplines.size === 1 ? (genders.size === 2 ? 100 : 50) : (genders.size === 2 ? 200 : 100);
    suggestions.push(`Add ${disciplineNames} to reach ${targetMultiplier}x`);
  }

  return suggestions;
}

/**
 * Check if a discipline+gender combination already exists in legs
 */
export function isDuplicateLeg(legs: ParlayLeg[], discipline: string, gender: string): boolean {
  return legs.some(leg => leg.discipline === discipline && leg.gender === gender);
}

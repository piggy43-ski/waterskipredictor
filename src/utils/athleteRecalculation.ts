/**
 * Athlete Performance Recalculation Utilities
 * Use these to trigger recalculations after data changes
 */

import { supabase } from '@/integrations/supabase/client';
import { calculatePerformanceIndex, calculateFantasyPrice } from './athleteCalculations';
import type { AthleteResult, Discipline } from './athleteCalculations';

/**
 * Recalculate performance and fantasy values for a single athlete-discipline combo
 */
export async function recalculateAthletePerformance(
  athleteId: string,
  discipline: Discipline
): Promise<{ success: boolean; error?: string }> {
  try {
    // Fetch athlete data
    const { data: athlete, error: athleteError } = await supabase
      .from('athletes')
      .select('*')
      .eq('id', athleteId)
      .single();

    if (athleteError || !athlete) {
      return { success: false, error: 'Athlete not found' };
    }

    // Fetch recent results (last 3)
    const { data: results, error: resultsError } = await supabase
      .from('athlete_results')
      .select('*')
      .eq('athlete_id', athleteId)
      .eq('discipline', discipline)
      .order('created_at', { ascending: false })
      .limit(3);

    if (resultsError) {
      return { success: false, error: 'Failed to fetch results' };
    }

    const athleteResults: AthleteResult[] = (results || []).map(r => ({
      position: r.position,
      made_finals: r.made_finals,
      missed_first_pass: r.missed_first_pass,
      missed_gate: r.missed_gate,
    }));

    // Calculate new values
    const performanceIndex = calculatePerformanceIndex({
      current_rank: athlete[`current_rank_${discipline}`] || null,
      recent_results: athleteResults,
      popularity_index: athlete.popularity_index || 0,
      manual_boost_factor: athlete.manual_boost_factor || 1.0,
      injury_flag: athlete.injury_flag || false,
    });

    const fantasyPrice = calculateFantasyPrice(performanceIndex, athlete.popularity_index || 0);

    // Update athlete
    const { error: updateError } = await supabase
      .from('athletes')
      .update({
        [`performance_index_${discipline}`]: performanceIndex,
        [`fantasy_price_${discipline}`]: fantasyPrice,
      })
      .eq('id', athleteId);

    if (updateError) {
      return { success: false, error: 'Failed to update athlete' };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Recalculate all disciplines for a single athlete
 */
export async function recalculateAllDisciplinesForAthlete(
  athleteId: string
): Promise<{ success: boolean; error?: string }> {
  const disciplines: Discipline[] = ['slalom', 'trick', 'jump'];
  
  for (const discipline of disciplines) {
    const result = await recalculateAthletePerformance(athleteId, discipline);
    if (!result.success) {
      return result;
    }
  }

  return { success: true };
}

/**
 * Recalculate all athletes in a specific tournament-discipline-gender combo
 * Use this after adding results or updating rankings
 */
export async function recalculateTournamentField(
  tournamentId: string,
  discipline: Discipline,
  gender: 'male' | 'female'
): Promise<{ success: boolean; processedCount: number; error?: string }> {
  try {
    // Get all unique athletes who competed in this event
    const { data: results, error: resultsError } = await supabase
      .from('athlete_results')
      .select('athlete_id')
      .eq('tournament_id', tournamentId)
      .eq('discipline', discipline)
      .eq('gender', gender);

    if (resultsError) {
      return { success: false, processedCount: 0, error: 'Failed to fetch results' };
    }

    const uniqueAthletes = [...new Set(results?.map(r => r.athlete_id) || [])];
    let processedCount = 0;

    for (const athleteId of uniqueAthletes) {
      const result = await recalculateAthletePerformance(athleteId, discipline);
      if (result.success) {
        processedCount++;
      }
    }

    return { success: true, processedCount };
  } catch (error: any) {
    return { success: false, processedCount: 0, error: error.message };
  }
}

/**
 * Update popularity index based on prediction activity
 * Call this periodically or when predictions are settled
 */
export async function updatePopularityIndices(): Promise<void> {
  // This would be implemented when we have prediction/selection data
  // For now, it's a placeholder for future integration
  
  // Example logic:
  // 1. Count how many times each athlete appears in user predictions
  // 2. Normalize counts to 0-1 scale
  // 3. Update athlete.popularity_index
}

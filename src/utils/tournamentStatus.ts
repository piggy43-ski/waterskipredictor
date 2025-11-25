import { Tournament } from '@/types';

/**
 * Calculate tournament status dynamically based on dates
 * - "upcoming" if current_timestamp < start_date
 * - "live" if start_date ≤ current_timestamp ≤ end_date
 * - "finished" if current_timestamp > end_date
 */
export const calculateTournamentStatus = (
  startDate: string,
  endDate: string
): Tournament['status'] => {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (now < start) {
    return 'upcoming';
  } else if (now >= start && now <= end) {
    return 'live';
  } else {
    return 'finished';
  }
};

/**
 * Apply dynamic status to a tournament object
 */
export const applyDynamicStatus = (tournament: any): Tournament => {
  return {
    ...tournament,
    status: calculateTournamentStatus(tournament.start_date, tournament.end_date)
  };
};

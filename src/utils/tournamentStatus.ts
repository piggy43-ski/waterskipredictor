import { Tournament } from '@/types';

/**
 * Calculate tournament status dynamically based on datetime
 * - "upcoming" if current_timestamp < start_datetime
 * - "live" if start_datetime ≤ current_timestamp ≤ end_datetime
 * - "finished" if current_timestamp > end_datetime
 */
export const calculateTournamentStatus = (
  startDatetime?: string,
  endDatetime?: string,
  fallbackStartDate?: string,
  fallbackEndDate?: string
): Tournament['status'] => {
  // Use UTC time for consistent timezone handling
  const now = new Date().getTime();
  
  // Use datetime if available, otherwise fall back to date-only
  const startStr = startDatetime || fallbackStartDate;
  const endStr = endDatetime || fallbackEndDate;
  
  if (!startStr || !endStr) return 'upcoming';
  
  const start = new Date(startStr).getTime();
  const end = new Date(endStr).getTime();

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
    status: calculateTournamentStatus(
      tournament.start_datetime, 
      tournament.end_datetime,
      tournament.start_date,
      tournament.end_date
    )
  };
};

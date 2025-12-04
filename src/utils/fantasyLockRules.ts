/**
 * Fantasy Lock Rules Utility
 * Determines when fantasy pots should be locked based on tournament status
 */

import { calculateTournamentStatus } from './tournamentStatus';

export interface TournamentInfo {
  id: string;
  start_datetime?: string | null;
  end_datetime?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
}

export interface FantasyPotInfo {
  id: string;
  status: string;
  pot_type: string;
  tournament_id?: string | null;
  season_tournaments?: string[] | null;
}

/**
 * Check if a fantasy pot is locked based on tournament status
 * - For tournament pots: locked when the linked tournament is live or finished
 * - For season pots: locked when ANY of the season tournaments is live or finished
 */
export function isFantasyPotLocked(
  pot: FantasyPotInfo,
  tournament?: TournamentInfo | null,
  seasonTournaments?: TournamentInfo[]
): boolean {
  // Already settled or cancelled = locked
  if (pot.status === 'settled' || pot.status === 'cancelled' || pot.status === 'locked') {
    return true;
  }

  // Tournament fantasy pot
  if (pot.pot_type === 'tournament' && tournament) {
    const tournamentStatus = calculateTournamentStatus(
      tournament.start_datetime || undefined,
      tournament.end_datetime || undefined,
      tournament.start_date || undefined,
      tournament.end_date || undefined
    );
    return tournamentStatus === 'live' || tournamentStatus === 'finished';
  }

  // Season fantasy pot - locked if ANY tournament is live or finished
  if (pot.pot_type === 'season' && seasonTournaments && seasonTournaments.length > 0) {
    return seasonTournaments.some(t => {
      const status = calculateTournamentStatus(
        t.start_datetime || undefined,
        t.end_datetime || undefined,
        t.start_date || undefined,
        t.end_date || undefined
      );
      return status === 'live' || status === 'finished';
    });
  }

  return false;
}

/**
 * Get the lock status message for UI display
 */
export function getLockStatusMessage(
  pot: FantasyPotInfo,
  tournament?: TournamentInfo | null,
  seasonTournaments?: TournamentInfo[]
): { isLocked: boolean; message: string; canJoin: boolean; canEdit: boolean } {
  const isLocked = isFantasyPotLocked(pot, tournament, seasonTournaments);

  if (pot.status === 'settled') {
    return {
      isLocked: true,
      message: 'League has been settled',
      canJoin: false,
      canEdit: false
    };
  }

  if (pot.status === 'cancelled') {
    return {
      isLocked: true,
      message: 'League was cancelled',
      canJoin: false,
      canEdit: false
    };
  }

  if (pot.status === 'locked') {
    return {
      isLocked: true,
      message: 'Entries are closed',
      canJoin: false,
      canEdit: false
    };
  }

  if (isLocked) {
    return {
      isLocked: true,
      message: 'Tournament has started - entries locked',
      canJoin: false,
      canEdit: false
    };
  }

  return {
    isLocked: false,
    message: 'Entries open - you can still edit your team',
    canJoin: true,
    canEdit: true
  };
}

/**
 * Calculate time until lock (tournament start)
 */
export function getTimeUntilLock(tournament?: TournamentInfo | null): string | null {
  if (!tournament) return null;

  const startStr = tournament.start_datetime || tournament.start_date;
  if (!startStr) return null;

  const startTime = new Date(startStr).getTime();
  const now = Date.now();

  if (now >= startTime) return null;

  const diff = startTime - now;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h until lock`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m until lock`;
  } else {
    return `${minutes}m until lock`;
  }
}

/**
 * Fantasy Lock Rules Utility
 * Determines when fantasy pots should be locked based on tournament status
 * 
 * For TOURNAMENT pots: locked when tournament is live or finished
 * For SEASON pots: uses transfer window logic - only locked during live tournaments
 */

import { calculateTournamentStatus } from './tournamentStatus';
import { getTransferWindowStatus, type SeasonTournament, type TransferWindowInfo } from './transferWindowRules';

export interface TournamentInfo {
  id: string;
  start_datetime?: string | null;
  end_datetime?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
  name?: string;
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
 * - For season pots: uses transfer window logic (locked only during live tournaments)
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

  // Tournament fantasy pot - original behavior
  if (pot.pot_type === 'tournament' && tournament) {
    const tournamentStatus = calculateTournamentStatus(
      tournament.start_datetime || undefined,
      tournament.end_datetime || undefined,
      tournament.start_date || undefined,
      tournament.end_date || undefined
    );
    return tournamentStatus === 'live' || tournamentStatus === 'finished';
  }

  // Season fantasy pot - use transfer window logic
  if (pot.pot_type === 'season' && seasonTournaments && seasonTournaments.length > 0) {
    const windowInfo = getTransferWindowStatus(seasonTournaments as SeasonTournament[]);
    // Only locked if a tournament is currently live
    return windowInfo.status === 'locked';
  }

  return false;
}

/**
 * Get detailed lock status for season pots (includes transfer window info)
 */
export function getSeasonLockStatus(
  pot: FantasyPotInfo,
  seasonTournaments?: TournamentInfo[]
): TransferWindowInfo {
  if (pot.pot_type !== 'season') {
    return {
      status: 'initial',
      canTransfer: true,
      canEditRoster: true,
      message: 'Not a season pot'
    };
  }

  if (pot.status === 'settled') {
    return {
      status: 'season_ended',
      canTransfer: false,
      canEditRoster: false,
      message: 'Season has been settled'
    };
  }

  if (pot.status === 'cancelled') {
    return {
      status: 'season_ended',
      canTransfer: false,
      canEditRoster: false,
      message: 'Season was cancelled'
    };
  }

  return getTransferWindowStatus(seasonTournaments as SeasonTournament[] || []);
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

  // For season pots, provide more detailed info
  if (pot.pot_type === 'season' && seasonTournaments) {
    const windowInfo = getSeasonLockStatus(pot, seasonTournaments);
    
    if (windowInfo.status === 'locked') {
      return {
        isLocked: true,
        message: windowInfo.message,
        canJoin: false,
        canEdit: false
      };
    }

    if (windowInfo.status === 'season_ended') {
      return {
        isLocked: true,
        message: 'Season has ended',
        canJoin: false,
        canEdit: false
      };
    }

    if (windowInfo.status === 'transfer_window') {
      return {
        isLocked: false,
        message: windowInfo.message,
        canJoin: true,
        canEdit: true
      };
    }

    // Initial state
    return {
      isLocked: false,
      message: windowInfo.message,
      canJoin: true,
      canEdit: true
    };
  }

  // Tournament pot behavior
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

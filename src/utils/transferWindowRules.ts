/**
 * Transfer Window Rules for Season Fantasy Leagues
 * 
 * Determines when users can buy/sell athletes based on tournament status:
 * - Before first tournament: Initial selection (always open)
 * - Tournament live: Roster locked for that tournament
 * - Between tournaments: Transfer window open
 * - After final tournament: Season ended
 */

import { calculateTournamentStatus } from './tournamentStatus';

export interface SeasonTournament {
  id: string;
  name: string;
  start_datetime?: string | null;
  end_datetime?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string;
}

export type TransferWindowStatus = 
  | 'initial'           // Before first tournament - can build initial team
  | 'locked'            // Tournament is live - no changes allowed
  | 'transfer_window'   // Between tournaments - can buy/sell
  | 'season_ended';     // All tournaments finished

export interface TransferWindowInfo {
  status: TransferWindowStatus;
  canTransfer: boolean;
  canEditRoster: boolean;
  currentTournament?: SeasonTournament;    // If locked, which tournament
  lastFinishedTournament?: SeasonTournament; // For context
  nextTournament?: SeasonTournament;       // Upcoming deadline
  deadline?: Date;                          // When window closes
  message: string;
}

/**
 * Calculate tournament status from dates
 */
function getTournamentRuntimeStatus(tournament: SeasonTournament): 'upcoming' | 'live' | 'finished' {
  return calculateTournamentStatus(
    tournament.start_datetime || undefined,
    tournament.end_datetime || undefined,
    tournament.start_date || undefined,
    tournament.end_date || undefined
  );
}

/**
 * Get the current transfer window status for a season fantasy pot
 */
export function getTransferWindowStatus(
  seasonTournaments: SeasonTournament[]
): TransferWindowInfo {
  // No tournaments linked - treat as initial
  if (!seasonTournaments || seasonTournaments.length === 0) {
    return {
      status: 'initial',
      canTransfer: true,
      canEditRoster: true,
      message: 'Build your initial team'
    };
  }

  // Sort tournaments by start date
  const sortedTournaments = [...seasonTournaments].sort((a, b) => {
    const dateA = new Date(a.start_datetime || a.start_date || 0);
    const dateB = new Date(b.start_datetime || b.start_date || 0);
    return dateA.getTime() - dateB.getTime();
  });

  // Calculate status for each tournament
  const tournamentStatuses = sortedTournaments.map(t => ({
    tournament: t,
    status: getTournamentRuntimeStatus(t)
  }));

  // Find live tournament (if any)
  const liveTournament = tournamentStatuses.find(ts => ts.status === 'live');
  if (liveTournament) {
    return {
      status: 'locked',
      canTransfer: false,
      canEditRoster: false,
      currentTournament: liveTournament.tournament,
      message: `Roster locked - ${liveTournament.tournament.name} is live`
    };
  }

  // Find finished tournaments and upcoming tournaments
  const finishedTournaments = tournamentStatuses
    .filter(ts => ts.status === 'finished')
    .map(ts => ts.tournament);
  
  const upcomingTournaments = tournamentStatuses
    .filter(ts => ts.status === 'upcoming')
    .map(ts => ts.tournament);

  // All tournaments finished = season ended
  if (upcomingTournaments.length === 0 && finishedTournaments.length > 0) {
    const seasonEndedLast = finishedTournaments[finishedTournaments.length - 1];
    return {
      status: 'season_ended',
      canTransfer: false,
      canEditRoster: false,
      lastFinishedTournament: seasonEndedLast,
      message: 'Season has ended'
    };
  }

  // No tournaments have started yet
  if (finishedTournaments.length === 0) {
    const initialNext = upcomingTournaments[0];
    const initialDeadline = initialNext
      ? new Date(initialNext.start_datetime || initialNext.start_date || 0)
      : undefined;

    return {
      status: 'initial',
      canTransfer: true,
      canEditRoster: true,
      nextTournament: initialNext,
      deadline: initialDeadline,
      message: initialDeadline
        ? `Build your team before ${formatDeadline(initialDeadline)}`
        : 'Build your initial team'
    };
  }

  // We have finished tournaments and upcoming tournaments = transfer window
  const lastFinished = finishedTournaments[finishedTournaments.length - 1];
  const nextTournament = upcomingTournaments[0];
  const deadline = nextTournament 
    ? new Date(nextTournament.start_datetime || nextTournament.start_date || 0)
    : undefined;

  return {
    status: 'transfer_window',
    canTransfer: true,
    canEditRoster: true,
    lastFinishedTournament: lastFinished,
    nextTournament,
    deadline,
    message: deadline 
      ? `Transfer window open until ${formatDeadline(deadline)}`
      : 'Transfer window open'
  };
}

/**
 * Format deadline for display
 */
function formatDeadline(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  
  if (diff <= 0) return 'now';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Get countdown text for transfer window deadline
 */
export function getTransferDeadlineCountdown(deadline?: Date): string | null {
  if (!deadline) return null;
  
  const now = new Date();
  const diff = deadline.getTime() - now.getTime();
  
  if (diff <= 0) return 'Closed';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 7) {
    return `${days} days left`;
  } else if (days > 0) {
    return `${days}d ${hours}h left`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  } else if (minutes > 30) {
    return `${minutes}m left`;
  } else {
    return `${minutes}m - closing soon!`;
  }
}

/**
 * Calculate transfer fee (optional house take on sales)
 */
export function calculateTransferFee(salePrice: number, feePercent: number): number {
  if (feePercent <= 0) return 0;
  return Math.floor(salePrice * (feePercent / 100));
}

/**
 * Get net proceeds from selling an athlete
 */
export function getNetSaleProceeds(salePrice: number, feePercent: number): number {
  const fee = calculateTransferFee(salePrice, feePercent);
  return salePrice - fee;
}

/**
 * Validate a transfer can be made
 */
export interface TransferValidation {
  valid: boolean;
  error?: string;
}

export function validateBuy(
  athletePrice: number,
  remainingBudget: number,
  currentRosterSize: number,
  maxRosterSize: number
): TransferValidation {
  if (athletePrice > remainingBudget) {
    return { valid: false, error: `Insufficient budget. Need ${athletePrice.toLocaleString()}, have ${remainingBudget.toLocaleString()}` };
  }
  
  if (currentRosterSize >= maxRosterSize) {
    return { valid: false, error: 'Roster is full. Sell an athlete first.' };
  }
  
  return { valid: true };
}

export function validateSell(
  athleteId: string,
  currentRoster: string[]
): TransferValidation {
  if (!currentRoster.includes(athleteId)) {
    return { valid: false, error: 'Athlete not on your roster' };
  }
  
  return { valid: true };
}

/**
 * Check if a specific tournament has been scored yet
 * (for deciding whether to allow transfers)
 */
export function isTournamentScored(tournament: SeasonTournament): boolean {
  const status = getTournamentRuntimeStatus(tournament);
  return status === 'finished';
}

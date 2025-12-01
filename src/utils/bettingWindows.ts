/**
 * Calculate betting window status for a tournament
 */
export interface BettingWindow {
  status: 'upcoming' | 'open' | 'closed' | 'finished';
  message: string;
  canBet: boolean;
  countdown?: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
}

/**
 * Get betting window status for a tournament
 * @param startDatetime - Tournament start datetime (or fallback date)
 * @param endDatetime - Tournament end datetime (or fallback date)
 * @param settledAt - Tournament settlement timestamp
 * @returns Betting window information
 */
export const getBettingWindowStatus = (
  startDatetime?: string, 
  endDatetime?: string,
  settledAt?: string | null
): BettingWindow => {
  const now = new Date();
  
  if (!startDatetime) {
    return {
      status: 'upcoming',
      message: 'Tournament dates TBD',
      canBet: false
    };
  }
  
  const start = new Date(startDatetime);
  const end = endDatetime ? new Date(endDatetime) : null;
  
  // Betting opens 24 hours before tournament start
  const bettingOpens = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  
  // Tournament has been settled
  if (settledAt) {
    return {
      status: 'finished',
      message: 'Tournament settled',
      canBet: false
    };
  }
  
  // Tournament has finished
  if (end && now > end) {
    return {
      status: 'finished',
      message: 'Tournament finished',
      canBet: false
    };
  }
  
  // Tournament has started (betting LOCKED)
  if (now >= start) {
    return {
      status: 'closed',
      message: 'Betting locked – event in progress',
      canBet: false
    };
  }
  
  // Betting window is open (within 24h before start)
  if (now >= bettingOpens && now < start) {
    const timeLeft = start.getTime() - now.getTime();
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    const message = days > 0 
      ? `Betting open – Starts in ${days}d ${hours}h`
      : hours > 0
        ? `Betting open – Starts in ${hours}h ${minutes}m`
        : `Betting open – Starts in ${minutes}m`;
    
    return {
      status: 'open',
      message,
      canBet: true
    };
  }
  
  // Too early - betting not yet open
  const timeUntilOpen = bettingOpens.getTime() - now.getTime();
  const days = Math.floor(timeUntilOpen / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeUntilOpen % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeUntilOpen % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeUntilOpen % (1000 * 60)) / 1000);
  
  const message = days > 0 
    ? `Betting opens in ${days}d ${hours}h`
    : hours > 0
      ? `Betting opens in ${hours}h ${minutes}m`
      : `Betting opens in ${minutes}m`;
  
  return {
    status: 'upcoming',
    message,
    canBet: false,
    countdown: { days, hours, minutes, seconds }
  };
};

/**
 * Format countdown timer
 */
export const formatCountdown = (countdown?: { days: number; hours: number; minutes: number; seconds: number }): string => {
  if (!countdown) return '';
  
  const parts = [];
  if (countdown.days > 0) parts.push(`${countdown.days}d`);
  if (countdown.hours > 0) parts.push(`${countdown.hours}h`);
  if (countdown.days === 0 && countdown.minutes > 0) parts.push(`${countdown.minutes}m`);
  if (countdown.days === 0 && countdown.hours === 0 && countdown.seconds > 0) parts.push(`${countdown.seconds}s`);
  
  return parts.join(' ');
};

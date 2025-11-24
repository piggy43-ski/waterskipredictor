/**
 * Calculate betting window status for a tournament
 */
export interface BettingWindow {
  status: 'upcoming' | 'open' | 'closed' | 'finished';
  message: string;
  canBet: boolean;
  countdown?: {
    hours: number;
    minutes: number;
    seconds: number;
  };
}

/**
 * Get betting window status for a tournament
 * @param startDate - Tournament start date
 * @param endDate - Tournament end date
 * @returns Betting window information
 */
export const getBettingWindowStatus = (startDate: string, endDate?: string): BettingWindow => {
  const now = new Date();
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;
  
  // Betting opens 24 hours before tournament start
  const bettingOpens = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  
  // Tournament has finished
  if (end && now > end) {
    return {
      status: 'finished',
      message: 'Tournament finished',
      canBet: false
    };
  }
  
  // Tournament has started (betting closed)
  if (now >= start) {
    return {
      status: 'closed',
      message: 'Betting closed – event in progress',
      canBet: false
    };
  }
  
  // Betting window is open (within 24h before start)
  if (now >= bettingOpens && now < start) {
    const timeLeft = start.getTime() - now.getTime();
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    return {
      status: 'open',
      message: `Betting open – Event starts in ${hours}h ${minutes}m`,
      canBet: true
    };
  }
  
  // Too early - betting not yet open
  const timeUntilOpen = bettingOpens.getTime() - now.getTime();
  const hours = Math.floor(timeUntilOpen / (1000 * 60 * 60));
  const minutes = Math.floor((timeUntilOpen % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeUntilOpen % (1000 * 60)) / 1000);
  
  return {
    status: 'upcoming',
    message: `Betting opens in ${hours}h ${minutes}m`,
    canBet: false,
    countdown: { hours, minutes, seconds }
  };
};

/**
 * Format countdown timer
 */
export const formatCountdown = (countdown?: { hours: number; minutes: number; seconds: number }): string => {
  if (!countdown) return '';
  
  const parts = [];
  if (countdown.hours > 0) parts.push(`${countdown.hours}h`);
  if (countdown.minutes > 0) parts.push(`${countdown.minutes}m`);
  if (countdown.hours === 0 && countdown.seconds > 0) parts.push(`${countdown.seconds}s`);
  
  return parts.join(' ');
};

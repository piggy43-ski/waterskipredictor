/**
 * Calculate prediction window status for a tournament
 */
export interface PredictionWindow {
  status: 'upcoming' | 'open' | 'closed' | 'finished';
  message: string;
  canPredict: boolean;
  countdown?: {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  };
}

/**
 * Get prediction window status for a tournament
 * @param startDatetime - Tournament start datetime (or fallback date)
 * @param endDatetime - Tournament end datetime (or fallback date)
 * @param settledAt - Tournament settlement timestamp
 * @returns Prediction window information
 */
export const getPredictionWindowStatus = (
  startDatetime?: string, 
  endDatetime?: string,
  settledAt?: string | null
): PredictionWindow => {
  const now = new Date();
  
  if (!startDatetime) {
    return {
      status: 'upcoming',
      message: 'Tournament dates TBD',
      canPredict: false
    };
  }
  
  const start = new Date(startDatetime);
  const end = endDatetime ? new Date(endDatetime) : null;
  
  // Predictions open 24 hours before tournament start
  const predictionsOpen = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  
  // Tournament has been settled
  if (settledAt) {
    return {
      status: 'finished',
      message: 'Tournament settled',
      canPredict: false
    };
  }
  
  // Tournament has finished
  if (end && now > end) {
    return {
      status: 'finished',
      message: 'Tournament finished',
      canPredict: false
    };
  }
  
  // Tournament has started (predictions LOCKED)
  if (now >= start) {
    return {
      status: 'closed',
      message: 'Predictions locked – event in progress',
      canPredict: false
    };
  }
  
  // Prediction window is open (within 24h before start)
  if (now >= predictionsOpen && now < start) {
    const timeLeft = start.getTime() - now.getTime();
    const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    
    const message = days > 0 
      ? `Predictions open – Starts in ${days}d ${hours}h`
      : hours > 0
        ? `Predictions open – Starts in ${hours}h ${minutes}m`
        : `Predictions open – Starts in ${minutes}m`;
    
    return {
      status: 'open',
      message,
      canPredict: true
    };
  }
  
  // Too early - predictions not yet open
  const timeUntilOpen = predictionsOpen.getTime() - now.getTime();
  const days = Math.floor(timeUntilOpen / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeUntilOpen % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeUntilOpen % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeUntilOpen % (1000 * 60)) / 1000);
  
  const message = days > 0 
    ? `Predictions open in ${days}d ${hours}h`
    : hours > 0
      ? `Predictions open in ${hours}h ${minutes}m`
      : `Predictions open in ${minutes}m`;
  
  return {
    status: 'upcoming',
    message,
    canPredict: false,
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

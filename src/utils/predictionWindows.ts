/**
 * Calculate prediction window status for a tournament
 */
export interface PredictionWindow {
  status: 'preview' | 'open' | 'partial_locked' | 'locked' | 'finished';
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
 * Format a future time delta as "Xd Yh Zm" / "Yh Zm" / "Zm".
 */
const formatDelta = (ms: number): string => {
  if (ms <= 0) return '0m';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

/**
 * Canonical display-state machine. Single source of truth for tournament page
 * header chip, parlay-button enablement, market interactivity.
 */
export const getPredictionWindowStatus = (
  startDatetime?: string,
  endDatetime?: string,
  settledAt?: string | null,
  predictionsOpenAt?: string | null,
  marketLockTimes: Array<string | null | undefined> = []
): PredictionWindow => {
  const now = new Date();

  // settled — terminal
  if (settledAt) {
    return { status: 'finished', message: 'Tournament settled', canPredict: false };
  }

  const start = startDatetime ? new Date(startDatetime) : null;
  const end = endDatetime ? new Date(endDatetime) : null;
  const opensAt = predictionsOpenAt ? new Date(predictionsOpenAt) : null;
  const lockTimes = marketLockTimes
    .filter((t): t is string => !!t)
    .map((t) => new Date(t))
    .sort((a, b) => a.getTime() - b.getTime());

  // finished
  if (end && now > end) {
    return { status: 'finished', message: 'Tournament finished', canPredict: false };
  }

  // preview — before predictions open
  if (opensAt && now < opensAt) {
    return {
      status: 'preview',
      message: `Predictions open in ${formatDelta(opensAt.getTime() - now.getTime())}`,
      canPredict: false,
    };
  }

  // If we have per-market lock times, drive open/partial_locked/locked from them
  if (lockTimes.length > 0) {
    const stillOpen = lockTimes.filter((t) => now < t);
    const allLocked = stillOpen.length === 0;
    if (allLocked) {
      return { status: 'locked', message: 'Awaiting results', canPredict: false };
    }
    if (stillOpen.length < lockTimes.length) {
      return {
        status: 'partial_locked',
        message: `${stillOpen.length} of ${lockTimes.length} divisions still open`,
        canPredict: true,
      };
    }
    const earliest = stillOpen[0];
    return {
      status: 'open',
      message: `Open — next lock in ${formatDelta(earliest.getTime() - now.getTime())}`,
      canPredict: true,
    };
  }

  // Fallback: no market-level locks → use tournament start as global lock
  if (start && now >= start) {
    return { status: 'locked', message: 'Predictions locked — event in progress', canPredict: false };
  }
  if (start) {
    return {
      status: 'open',
      message: `Open — locks in ${formatDelta(start.getTime() - now.getTime())}`,
      canPredict: true,
    };
  }

  return { status: 'preview', message: 'Tournament dates TBD', canPredict: false };
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

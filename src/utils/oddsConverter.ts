/**
 * Convert decimal odds to American odds
 * @param decimalOdds - Decimal odds (e.g., 2.5)
 * @returns American odds (e.g., +150 or -200)
 */
export const decimalToAmerican = (decimalOdds: number): string => {
  if (decimalOdds >= 2) {
    // Underdog: positive American odds
    const americanOdds = Math.round((decimalOdds - 1) * 100);
    return `+${americanOdds}`;
  } else {
    // Favorite: negative American odds
    const americanOdds = Math.round(-100 / (decimalOdds - 1));
    return `${americanOdds}`;
  }
};

/**
 * Convert American odds to decimal odds
 * @param americanOdds - American odds (e.g., "+150" or "-200")
 * @returns Decimal odds (e.g., 2.5)
 */
export const americanToDecimal = (americanOdds: string | number): number => {
  const odds = typeof americanOdds === 'string' ? parseFloat(americanOdds) : americanOdds;
  
  if (odds >= 100) {
    // Positive American odds (underdog)
    return (odds / 100) + 1;
  } else {
    // Negative American odds (favorite)
    return (100 / Math.abs(odds)) + 1;
  }
};

/**
 * Calculate payout from American odds
 * @param stake - Amount staked
 * @param americanOdds - American odds string (e.g., "+150")
 * @returns Total payout including stake
 */
export const calculatePayoutAmerican = (stake: number, americanOdds: string): number => {
  const decimalOdds = americanToDecimal(americanOdds);
  return Math.floor(stake * decimalOdds);
};

/**
 * Format American odds for display
 */
export const formatAmericanOdds = (odds: string | number): string => {
  const oddsNum = typeof odds === 'string' ? parseFloat(odds) : odds;
  if (oddsNum > 0) {
    return `+${oddsNum}`;
  }
  return `${oddsNum}`;
};

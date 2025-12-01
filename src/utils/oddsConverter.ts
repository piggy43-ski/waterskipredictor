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

/**
 * Calculate combined parlay odds from multiple decimal odds with house edge applied
 * @param decimalOdds - Array of decimal odds for each leg
 * @param houseEdge - House edge percentage (default 5% = 0.05)
 * @returns Combined decimal odds after applying house edge
 */
export const calculateParlayOdds = (decimalOdds: number[], houseEdge: number = 0.05): number => {
  // Multiply all decimal odds together
  const combinedOdds = decimalOdds.reduce((acc, odds) => acc * odds, 1);
  
  // Apply house edge (5% = multiply by 0.95)
  const adjustedOdds = combinedOdds * (1 - houseEdge);
  
  return adjustedOdds;
};

/**
 * Calculate parlay payout with house edge applied
 * @param stake - Amount staked
 * @param decimalOdds - Array of decimal odds for each leg
 * @param houseEdge - House edge percentage (default 5% = 0.05)
 * @returns Total payout including stake
 */
export const calculateParlayPayout = (
  stake: number, 
  decimalOdds: number[], 
  houseEdge: number = 0.05
): number => {
  const adjustedOdds = calculateParlayOdds(decimalOdds, houseEdge);
  return Math.floor(stake * adjustedOdds);
};

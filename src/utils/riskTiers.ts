/**
 * Risk tier system for athlete selections
 * Adds visual context to help users understand and feel good about picking underdogs
 */

export type RiskTier = 'favorite' | 'contender' | 'bold_pick' | 'longshot';

export interface RiskTierInfo {
  tier: RiskTier;
  label: string;
  emoji: string;
  description: string;
  colorClass: string;
  badgeVariant: 'default' | 'secondary' | 'outline' | 'destructive';
}

/**
 * Calculate risk tier based on probability or multiplier
 * Uses multiplier since that's what we have in selections
 */
export function getRiskTierFromMultiplier(multiplier: number): RiskTierInfo {
  // Convert multiplier to approximate probability: p ≈ 1 / (multiplier * edge_factor)
  // Using edge factor of ~0.91 for winner markets
  const impliedProb = 1 / multiplier;
  
  // Probability thresholds (based on implied probability from multiplier)
  // multiplier 1.5-2.5 → ~40-67% → Favorite
  // multiplier 2.5-5 → ~20-40% → Contender  
  // multiplier 5-10 → ~10-20% → Bold Pick
  // multiplier 10+ → <10% → Longshot
  
  if (multiplier <= 2.5) {
    return {
      tier: 'favorite',
      label: 'Favorite',
      emoji: '🏆',
      description: 'Tournament leader, lower rewards',
      colorClass: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
      badgeVariant: 'default',
    };
  }
  
  if (multiplier <= 5) {
    return {
      tier: 'contender',
      label: 'Contender',
      emoji: '💪',
      description: 'Strong competitor, solid returns',
      colorClass: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800',
      badgeVariant: 'secondary',
    };
  }
  
  if (multiplier <= 10) {
    return {
      tier: 'bold_pick',
      label: 'Bold Pick',
      emoji: '🔥',
      description: '',
      colorClass: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
      badgeVariant: 'outline',
    };
  }
  
  return {
    tier: 'longshot',
    label: 'Longshot',
    emoji: '🚀',
    description: '',
    colorClass: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    badgeVariant: 'destructive',
  };
}

/**
 * Check if a selection qualifies as an underdog (Bold Pick or Longshot)
 */
export function isUnderdog(multiplier: number): boolean {
  return multiplier > 5;
}

/**
 * Get motivational text for underdog picks
 */
export function getUnderdogMotivation(tier: RiskTier): string {
  switch (tier) {
    case 'bold_pick':
      return 'Upsets happen more often than you think!';
    case 'longshot':
      return 'Fortune favors the bold. One win could change everything!';
    default:
      return '';
  }
}

/**
 * Get potential reward framing for underdog picks
 */
export function getRewardFraming(multiplier: number, entryAmount: number): string {
  const projectedRewards = Math.floor(entryAmount * multiplier);
  const profit = projectedRewards - entryAmount;
  
  if (multiplier >= 10) {
    return `Turn ${entryAmount} into ${projectedRewards.toLocaleString()} tokens!`;
  }
  if (multiplier >= 5) {
    return `${profit.toLocaleString()} token profit potential`;
  }
  return '';
}

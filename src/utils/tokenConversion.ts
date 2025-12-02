/**
 * Token to USD conversion utilities
 * Rate: 100 tokens = $1 USD (1 token = $0.01)
 */

export const TOKENS_PER_USD = 100;

/**
 * Convert tokens to USD
 */
export const tokensToUSD = (tokens: number): number => {
  return tokens / TOKENS_PER_USD;
};

/**
 * Convert USD to tokens
 */
export const usdToTokens = (usd: number): number => {
  return usd * TOKENS_PER_USD;
};

/**
 * Format tokens with USD equivalent in parentheses
 * Example: "10,000 ($100.00)"
 */
export const formatTokensWithUSD = (tokens: number): string => {
  const usd = tokensToUSD(tokens);
  return `${tokens.toLocaleString()} ($${usd.toFixed(2)})`;
};

/**
 * Format tokens only
 */
export const formatTokens = (tokens: number): string => {
  return tokens.toLocaleString();
};

/**
 * Format USD only
 */
export const formatUSD = (usd: number): string => {
  return `$${usd.toFixed(2)}`;
};

/**
 * Format P/L with sign and color class
 */
export const formatPL = (tokens: number): { text: string; isPositive: boolean } => {
  const sign = tokens >= 0 ? '+' : '';
  return {
    text: `${sign}${formatTokensWithUSD(tokens)}`,
    isPositive: tokens >= 0,
  };
};

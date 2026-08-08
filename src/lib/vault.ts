import { supabase } from '@/integrations/supabase/client';

/**
 * THE VAULT — shared client helpers.
 * Gear marketplace. Real money (USD). Completely separate from prediction tokens.
 */

/** Require a verified saved card before the first bid is accepted.
 *  Enforced in the database by vault_place_bid; mirrored here for the UI. */
export const VAULT_REQUIRE_PAYMENT_METHOD = true;

export const VAULT_ANTI_SNIPE_MINUTES = 5;
/** Fallback only — the real label lives in vault_shipping_zones (zone 5). */
export const VAULT_PICKUP_FALLBACK_LABEL = 'Local pickup — Central Florida (address sent after payment)';

/** Render the local-pickup label from the shipping-zone table, never a hardcoded city. */
export function pickupLabel(zones: { zone: number; label?: string | null }[] | null | undefined): string {
  const z = zones?.find((z) => Number(z.zone) === 5);
  return z?.label || VAULT_PICKUP_FALLBACK_LABEL;
}

export type VaultCondition = 'brand_new' | 'barely_ridden' | 'ridden';

export const CONDITION_LABEL: Record<VaultCondition, string> = {
  brand_new: 'Brand New',
  barely_ridden: 'Barely Ridden',
  ridden: 'Ridden',
};

/** Mirrors public.vault_bid_increment(numeric) in the database. */
export function bidIncrement(price: number): number {
  if (price < 100) return 5;
  if (price < 300) return 10;
  if (price < 700) return 25;
  if (price < 1500) return 50;
  return 100;
}

export function minNextBid(currentPrice: number, bidCount: number, startPrice: number): number {
  if (!bidCount) return startPrice;
  return currentPrice + bidIncrement(currentPrice);
}

export function usd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);
}

/** Resolve a stored storage path (or absolute URL) into a displayable URL. */
export async function resolveVaultImage(pathOrUrl: string): Promise<string> {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const { data } = await supabase.storage
    .from('vault-photos')
    .createSignedUrl(pathOrUrl, 60 * 60 * 24 * 7);
  return data?.signedUrl ?? '';
}

export async function resolveVaultImages(paths: string[] | null | undefined): Promise<string[]> {
  if (!paths?.length) return [];
  return Promise.all(paths.map(resolveVaultImage));
}

/** Shipping zone lookup by US state code. */
export function zoneForState(
  state: string,
  zones: { zone: number; states: string[]; price: number }[]
): { zone: number; price: number } | null {
  const s = (state || '').trim().toUpperCase();
  const hit = zones.find((z) => z.states?.includes(s));
  return hit ? { zone: hit.zone, price: Number(hit.price) } : null;
}

export function timeLeftParts(target: string | null, nowMs: number) {
  if (!target) return null;
  const diff = new Date(target).getTime() - nowMs;
  if (diff <= 0) return { ended: true, d: 0, h: 0, m: 0, s: 0, diff: 0 };
  const s = Math.floor(diff / 1000);
  return {
    ended: false,
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
    diff,
  };
}
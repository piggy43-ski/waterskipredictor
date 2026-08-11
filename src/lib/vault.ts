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

/** Referral attribution: ?ref=<consignor-slug> persists across the signup flow. */
const REF_KEY = 'vault_ref';

export function captureVaultRef(search: string): void {
  try {
    const ref = new URLSearchParams(search).get('ref');
    if (ref) sessionStorage.setItem(REF_KEY, ref.slice(0, 64));
  } catch {
    /* sessionStorage unavailable */
  }
}

export function getVaultRef(): string | null {
  try {
    return sessionStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

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

/* ---------------------------------------------------------------
 * Weekly single-lot format: teaser (Wed) → live (Fri) → close (Sun)
 * ------------------------------------------------------------- */

export type LotStage = 'before' | 'live' | 'closing' | 'sold';

/** Final 15 minutes of an auction get the escalated "closing" treatment. */
export const VAULT_CLOSING_WINDOW_MS = 15 * 60 * 1000;
/** Milestone thresholds are stored in vault_milestones; this is only the local fallback order. */
export const VAULT_MILESTONE_SORT = (a: { threshold: number }, b: { threshold: number }) =>
  a.threshold - b.threshold;

export interface LotTiming {
  reveal_state?: string | null;
  status?: string | null;
  teaser_at?: string | null;
  drop_opens_at?: string | null;
  drop_closes_at?: string | null;
  closes_at?: string | null;
}

/**
 * Single-lot format. Four states, all driven off server time:
 * before → live → closing (final 15 min) → sold.
 */
export function lotStage(lot: LotTiming | null | undefined, nowMs: number): LotStage {
  if (!lot) return 'before';
  if (lot.status && ['sold', 'ended_met', 'ended_no_reserve_met'].includes(lot.status)) return 'sold';
  const end = lot.closes_at ?? lot.drop_closes_at;
  if (end && new Date(end).getTime() <= nowMs) return 'sold';
  const open = lot.drop_opens_at;
  if (open && nowMs < new Date(open).getTime()) return 'before';
  if (!open && lot.status !== 'live') return 'before';
  if (end && new Date(end).getTime() - nowMs <= VAULT_CLOSING_WINDOW_MS) return 'closing';
  return 'live';
}

export function lotLabel(n: number | null | undefined): string {
  return `LOT ${String(n ?? 0).padStart(2, '0')}`;
}

export function relativeTime(iso: string, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
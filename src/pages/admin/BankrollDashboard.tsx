import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { tokensToUSD, formatUSD } from '@/utils/tokenConversion';
import { ThresholdBanner, type BannerTrigger } from '@/components/admin/bankroll/ThresholdBanner';
import { HeadlineMetrics, type HeadlineMetric, type MetricTone } from '@/components/admin/bankroll/HeadlineMetrics';
import { EventBreakdownTable, type EventRow } from '@/components/admin/bankroll/EventBreakdownTable';
import { UserConcentrationTable, type UserConcentrationRow } from '@/components/admin/bankroll/UserConcentrationTable';
import { MarketExposureTable, type MarketExposureRow } from '@/components/admin/bankroll/MarketExposureTable';
import { Skeleton } from '@/components/ui/skeleton';

const REFRESH_MS = 30_000;
const SNAPSHOT_KEY = 'bankroll_dashboard_snapshot_v1';
const SNAPSHOT_MAX_AGE_MS = 55 * 60 * 1000; // rotate at 55m → ~1h rolling
const SINGLE_SLIP_THRESHOLD_TOKENS = 2_000;

interface Snapshot {
  ts: number;
  cashUsd: number;
  walletLiabilityUsd: number;
  openExposureUsd: number;
  netPositionUsd: number;
}

interface DashboardData {
  cashUsd: number;
  cashSource: 'deposit_ledger' | 'purchased_tokens';
  walletLiabilityTokens: number;
  totalEarnedTokens: number;
  realizedPayoutsUsd: number;
  openExposureTokens: number;
  maxSingleSlipTokens: number;
  events: EventRow[];
  topUsers: UserConcentrationRow[];
  markets: MarketExposureRow[];
}

const fetchAll = async (): Promise<DashboardData> => {
  const [
    deposits,
    wallets,
    realized,
    openSlips,
    closedSlips,
    tournamentsRes,
    marketsRes,
  ] = await Promise.all([
    supabase.from('deposit_ledger').select('amount_usd').eq('transaction_type', 'deposit'),
    supabase.from('token_wallets').select('user_id, earned_tokens, purchased_tokens'),
    supabase
      .from('token_transactions')
      .select('amount, type')
      .in('type', ['prediction_won', 'bet_won', 'fantasy_payout']),
    supabase
      .from('bet_slips')
      .select('id, tournament_id, market_id, type, total_stake_tokens, potential_payout_tokens')
      .eq('status', 'PENDING'),
    supabase
      .from('bet_slips')
      .select('id, tournament_id, status, total_stake_tokens, actual_payout_tokens, created_at')
      .in('status', ['WON', 'LOST', 'VOID'])
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()),
    supabase.from('tournaments').select('id, name, status, settled_at, start_datetime'),
    supabase.from('markets').select('id, name, market_type, tournament_id'),
  ]);

  for (const r of [deposits, wallets, realized, openSlips, closedSlips, tournamentsRes, marketsRes]) {
    if (r.error) throw r.error;
  }

  // Cash collected
  const depositSumUsd = (deposits.data ?? []).reduce(
    (s, r) => s + Number(r.amount_usd ?? 0),
    0,
  );
  const purchasedTokens = (wallets.data ?? []).reduce(
    (s, r) => s + Number(r.purchased_tokens ?? 0),
    0,
  );
  const cashUsd = depositSumUsd > 0 ? depositSumUsd : tokensToUSD(purchasedTokens);
  const cashSource: DashboardData['cashSource'] =
    depositSumUsd > 0 ? 'deposit_ledger' : 'purchased_tokens';

  // Wallet liability
  const walletLiabilityTokens = (wallets.data ?? []).reduce(
    (s, r) => s + Number(r.earned_tokens ?? 0) + Number(r.purchased_tokens ?? 0),
    0,
  );
  const totalEarnedTokens = (wallets.data ?? []).reduce(
    (s, r) => s + Number(r.earned_tokens ?? 0),
    0,
  );

  // Realized payouts
  const realizedTokens = (realized.data ?? []).reduce(
    (s, r) => s + Number(r.amount ?? 0),
    0,
  );
  const realizedPayoutsUsd = tokensToUSD(realizedTokens);

  // Open exposure
  const openSlipsRows = (openSlips.data ?? []) as Array<{
    id: string;
    tournament_id: string | null;
    market_id: string | null;
    type: string;
    total_stake_tokens: number;
    potential_payout_tokens: number;
  }>;
  const openExposureTokens = openSlipsRows.reduce(
    (s, r) => s + Number(r.potential_payout_tokens ?? 0),
    0,
  );
  const maxSingleSlipTokens = openSlipsRows.reduce(
    (m, r) => Math.max(m, Number(r.potential_payout_tokens ?? 0)),
    0,
  );

  // Top users
  const sortedWallets = [...(wallets.data ?? [])].sort(
    (a: Record<string, unknown>, b) => Number(b.earned_tokens ?? 0) - Number(a.earned_tokens ?? 0),
  );
  const topUsers: UserConcentrationRow[] = sortedWallets
    .filter((w) => Number(w.earned_tokens ?? 0) > 0)
    .slice(0, 10)
    .map((w) => ({
      user_id: w.user_id,
      earned_tokens: Number(w.earned_tokens ?? 0),
      pct_of_total:
        totalEarnedTokens > 0 ? (Number(w.earned_tokens ?? 0) / totalEarnedTokens) * 100 : 0,
    }));

  // Markets index
  const marketById = new Map(
    (marketsRes.data ?? []).map((m) => [m.id, m]),
  );
  const tournamentById = new Map(
    (tournamentsRes.data ?? []).map((t) => [t.id, t]),
  );

  // Open exposure by market (+ aggregate "Parlays" bucket for null market_id)
  const marketAgg = new Map<string, MarketExposureRow>();
  let parlayTickets = 0;
  let parlayPayout = 0;
  for (const r of openSlipsRows) {
    if (!r.market_id) {
      parlayTickets += 1;
      parlayPayout += Number(r.potential_payout_tokens ?? 0);
      continue;
    }
    const m: Record<string, unknown> = marketById.get(r.market_id);
    const t: Record<string, unknown> = r.tournament_id ? tournamentById.get(r.tournament_id) : null;
    const existing = marketAgg.get(r.market_id);
    if (existing) {
      existing.open_tickets += 1;
      existing.open_payout_tokens += Number(r.potential_payout_tokens ?? 0);
    } else {
      marketAgg.set(r.market_id, {
        key: r.market_id,
        market_name: m?.name ?? '(unknown market)',
        market_type: m?.market_type ?? null,
        tournament_name: t?.name ?? '—',
        open_tickets: 1,
        open_payout_tokens: Number(r.potential_payout_tokens ?? 0),
      });
    }
  }
  const markets = Array.from(marketAgg.values()).sort(
    (a, b) => b.open_payout_tokens - a.open_payout_tokens,
  );
  if (parlayTickets > 0) {
    markets.push({
      key: 'parlays',
      market_name: 'Parlays',
      market_type: 'PARLAY',
      tournament_name: '—',
      open_tickets: parlayTickets,
      open_payout_tokens: parlayPayout,
    });
  }

  // Per-event aggregation (last 90d)
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const eventAgg = new Map<
    string,
    {
      tournament_id: string;
      entries: number;
      stake_tokens: number;
      open_payout_tokens: number;
      actual_payout_tokens: number;
    }
  >();

  // include open slips (not bound to 90d filter in spec, but they're current)
  for (const r of openSlipsRows) {
    if (!r.tournament_id) continue;
    const e =
      eventAgg.get(r.tournament_id) ??
      {
        tournament_id: r.tournament_id,
        entries: 0,
        stake_tokens: 0,
        open_payout_tokens: 0,
        actual_payout_tokens: 0,
      };
    e.entries += 1;
    e.stake_tokens += Number(r.total_stake_tokens ?? 0);
    e.open_payout_tokens += Number(r.potential_payout_tokens ?? 0);
    eventAgg.set(r.tournament_id, e);
  }
  for (const r of (closedSlips.data ?? []) as any[]) {
    if (!r.tournament_id) continue;
    if (new Date(r.created_at).getTime() < cutoff) continue;
    const e =
      eventAgg.get(r.tournament_id) ??
      {
        tournament_id: r.tournament_id,
        entries: 0,
        stake_tokens: 0,
        open_payout_tokens: 0,
        actual_payout_tokens: 0,
      };
    e.entries += 1;
    e.stake_tokens += Number(r.total_stake_tokens ?? 0);
    e.actual_payout_tokens += Number(r.actual_payout_tokens ?? 0);
    eventAgg.set(r.tournament_id, e);
  }
  const events: EventRow[] = Array.from(eventAgg.values())
    .map((e) => {
      const t: Record<string, unknown> = tournamentById.get(e.tournament_id);
      return {
        ...e,
        name: t?.name ?? '(unknown)',
        status: t?.status ?? 'unknown',
        settled: !!t?.settled_at,
      };
    })
    .sort((a, b) => {
      const ta: Record<string, unknown> = tournamentById.get(a.tournament_id);
      const tb: Record<string, unknown> = tournamentById.get(b.tournament_id);
      const da = ta?.start_datetime ? new Date(ta.start_datetime).getTime() : 0;
      const db = tb?.start_datetime ? new Date(tb.start_datetime).getTime() : 0;
      return db - da;
    });

  return {
    cashUsd,
    cashSource,
    walletLiabilityTokens,
    totalEarnedTokens,
    realizedPayoutsUsd,
    openExposureTokens,
    maxSingleSlipTokens,
    events,
    topUsers,
    markets,
  };
};

const formatDeltaMins = (ms: number): string => {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const r = mins % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
};

const formatDelta = (
  current: number,
  prev: number | null,
  ageMs: number | null,
): string => {
  if (prev === null || ageMs === null) return '(baseline set)';
  const diff = current - prev;
  if (Math.abs(diff) < 0.005) return `(no change in last ${formatDeltaMins(ageMs)})`;
  const sign = diff >= 0 ? '+' : '−';
  return `(${sign}${formatUSD(Math.abs(diff))} in last ${formatDeltaMins(ageMs)})`;
};

const loadSnapshot = (): Snapshot | null => {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
};

const saveSnapshot = (s: Snapshot) => {
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
};

const BankrollDashboard = () => {
  const { data, dataUpdatedAt, isLoading, isError, error } = useQuery({
    queryKey: ['admin-bankroll-dashboard'],
    queryFn: fetchAll,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

  // 1s ticker for "updated Ns ago"
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Snapshot rotation for ~1h deltas
  const [snapshot, setSnapshot] = useState<Snapshot | null>(() => loadSnapshot());
  useEffect(() => {
    if (!data) return;
    const openExposureUsd = tokensToUSD(data.openExposureTokens);
    const walletLiabilityUsd = tokensToUSD(data.walletLiabilityTokens);
    const netPositionUsd = data.cashUsd - data.realizedPayoutsUsd - openExposureUsd;
    const current: Snapshot = {
      ts: Date.now(),
      cashUsd: data.cashUsd,
      walletLiabilityUsd,
      openExposureUsd,
      netPositionUsd,
    };
    if (!snapshot || Date.now() - snapshot.ts >= SNAPSHOT_MAX_AGE_MS) {
      saveSnapshot(current);
      setSnapshot(current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataUpdatedAt]);

  const { metrics, triggers } = useMemo(() => {
    if (!data) return { metrics: [] as HeadlineMetric[], triggers: [] as BannerTrigger[] };

    const openExposureUsd = tokensToUSD(data.openExposureTokens);
    const walletLiabilityUsd = tokensToUSD(data.walletLiabilityTokens);
    const netPositionUsd = data.cashUsd - data.realizedPayoutsUsd - openExposureUsd;
    const ageMs = snapshot ? Date.now() - snapshot.ts : null;

    // Tone for net position
    let netTone: MetricTone = 'green';
    if (netPositionUsd < -500) netTone = 'red';
    else if (netPositionUsd < 0) netTone = 'yellow';

    // Tone for open exposure vs cash
    const exposureRatio = data.cashUsd > 0 ? openExposureUsd / data.cashUsd : 0;
    let exposureTone: MetricTone = 'neutral';
    if (exposureRatio > 1) exposureTone = 'red';
    else if (exposureRatio > 0.5) exposureTone = 'yellow';

    const metrics: HeadlineMetric[] = [
      {
        label: 'Cash collected',
        valueUsd: data.cashUsd,
        valueTokens: Math.round(data.cashUsd * 100),
        tone: 'neutral',
        deltaText: formatDelta(data.cashUsd, snapshot?.cashUsd ?? null, ageMs),
        deltaTone:
          snapshot && data.cashUsd > snapshot.cashUsd
            ? 'green'
            : 'neutral',
      },
      {
        label: 'Total wallet liability',
        valueUsd: walletLiabilityUsd,
        valueTokens: data.walletLiabilityTokens,
        tone: 'neutral',
        deltaText: formatDelta(walletLiabilityUsd, snapshot?.walletLiabilityUsd ?? null, ageMs),
        deltaTone:
          snapshot && walletLiabilityUsd > snapshot.walletLiabilityUsd
            ? 'red'
            : 'neutral',
      },
      {
        label: 'Open exposure',
        valueUsd: openExposureUsd,
        valueTokens: data.openExposureTokens,
        tone: exposureTone,
        deltaText: formatDelta(openExposureUsd, snapshot?.openExposureUsd ?? null, ageMs),
        deltaTone:
          snapshot && openExposureUsd > snapshot.openExposureUsd
            ? 'red'
            : 'neutral',
      },
      {
        label: 'Net house position',
        valueUsd: netPositionUsd,
        valueTokens: Math.round(netPositionUsd * 100),
        tone: netTone,
        deltaText: formatDelta(netPositionUsd, snapshot?.netPositionUsd ?? null, ageMs),
        deltaTone: 'neutral',
      },
    ];

    // Banner triggers
    const triggers: BannerTrigger[] = [];
    if (netPositionUsd < -1000) {
      triggers.push({
        level: 'critical',
        message: `Net house position ${formatUSD(netPositionUsd)} is below −$1,000. Investigate exposure or open settlements.`,
      });
    }
    if (data.cashUsd > 0 && exposureRatio > 1) {
      triggers.push({
        level: 'critical',
        message: `Open exposure ${formatUSD(openExposureUsd)} — ${(exposureRatio * 100).toFixed(0)}% of cash collected ${formatUSD(data.cashUsd)}. Tighten caps or close hot markets.`,
      });
    } else if (data.cashUsd > 0 && exposureRatio > 0.5) {
      triggers.push({
        level: 'warning',
        message: `Open exposure ${formatUSD(openExposureUsd)} — ${(exposureRatio * 100).toFixed(0)}% of cash collected ${formatUSD(data.cashUsd)}. Tighten caps or close hot markets.`,
      });
    }
    const topConcentration = data.topUsers[0];
    if (topConcentration && topConcentration.pct_of_total > 10) {
      triggers.push({
        level: 'warning',
        message: `User ${topConcentration.user_id.slice(0, 8)} holds ${topConcentration.pct_of_total.toFixed(1)}% of total earned tokens (${formatUSD(tokensToUSD(topConcentration.earned_tokens))}). Single-user concentration risk.`,
      });
    }
    if (data.maxSingleSlipTokens > SINGLE_SLIP_THRESHOLD_TOKENS) {
      triggers.push({
        level: 'warning',
        message: `Largest open slip potential payout ${formatUSD(tokensToUSD(data.maxSingleSlipTokens))} exceeds $20. Review the ticket.`,
      });
    }

    return { metrics, triggers };
  }, [data, snapshot, now]);

  const updatedSecondsAgo = dataUpdatedAt ? Math.max(0, Math.floor((now - dataUpdatedAt) / 1000)) : 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bankroll & Exposure</h1>
            <p className="text-sm text-muted-foreground">
              Live operational visibility on house position. Auto-refresh every 30s.
            </p>
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {dataUpdatedAt
              ? `Updated ${updatedSecondsAgo}s ago${data ? ` · cash from ${data.cashSource}` : ''}`
              : 'Loading…'}
          </div>
        </div>

        {isError && (
          <div className="text-sm text-destructive">
            Failed to load: {(error as Error)?.message ?? 'unknown error'}
          </div>
        )}

        {isLoading || !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        ) : (
          <>
            <ThresholdBanner triggers={triggers} />
            <HeadlineMetrics metrics={metrics} />
            <EventBreakdownTable rows={data.events} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <UserConcentrationTable rows={data.topUsers} totalEarned={data.totalEarnedTokens} />
              <MarketExposureTable rows={data.markets} />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default BankrollDashboard;
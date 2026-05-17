import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DollarSign, AlertTriangle, Info, TrendingUp, Wallet, Save } from 'lucide-react';
import { toast } from 'sonner';

// Worst-case scenario D with caps (Task 1 finding) — 600k handle = 100 entries/market.
// Scales linearly with handle ratio for bankroll target calc.
const WORST_CASE_D_AT_600K_HANDLE_TOKENS = 321_500;

interface RewardRow {
  id: string;
  name: string;
  tier: string | null;
  category: string;
  required_tokens: number;
  usd_cost: number | null;                  // wholesale
  fulfillment_overhead_usd: number | null;
  redemption_frequency_weight: number | null;
  available: boolean;
}

interface Tournament {
  id: string;
  name: string;
  start_date: string;
  status: string;
  max_handle_tokens: number | null;
  current_handle_tokens: number;
}

function fmtUsd(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString();
}

export default function AdminEconomics() {
  const qc = useQueryClient();

  const { data: rewards, isLoading: loadingRewards } = useQuery({
    queryKey: ['admin', 'economics', 'rewards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rewards')
        .select('id, name, tier, category, required_tokens, usd_cost, fulfillment_overhead_usd, redemption_frequency_weight, available')
        .eq('available', true)
        .order('required_tokens');
      if (error) throw error;
      return (data || []) as unknown as RewardRow[];
    },
  });

  const { data: wallets } = useQuery({
    queryKey: ['admin', 'economics', 'wallets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_wallets')
        .select('earned_tokens, purchased_tokens');
      if (error) throw error;
      const earned = (data || []).reduce((s, w: any) => s + (w.earned_tokens || 0), 0);
      const purchased = (data || []).reduce((s, w: any) => s + (w.purchased_tokens || 0), 0);
      return { earned, purchased, outstanding: earned + purchased };
    },
  });

  const { data: deposits } = useQuery({
    queryKey: ['admin', 'economics', 'deposits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_ledger')
        .select('tokens_amount, amount_usd, transaction_type');
      if (error) throw error;
      const purchases = (data || []).filter((d: any) => d.transaction_type === 'purchase');
      const totalUsd = purchases.reduce((s, d: any) => s + Number(d.amount_usd || 0), 0);
      const totalTokens = purchases.reduce((s, d: any) => s + Number(d.tokens_amount || 0), 0);
      return { totalUsd, totalTokens, count: purchases.length };
    },
  });

  const { data: redemptions } = useQuery({
    queryKey: ['admin', 'economics', 'redemptions'],
    queryFn: async () => {
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const { data, error } = await supabase
        .from('redemptions')
        .select('reward_id, tokens_spent, status, created_at')
        .gte('created_at', startOfYear)
        .neq('status', 'cancelled');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: nextEvent } = useQuery({
    queryKey: ['admin', 'economics', 'next-event'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, start_date, status, max_handle_tokens, current_handle_tokens')
        .in('status', ['upcoming', 'live', 'open'])
        .not('max_handle_tokens', 'is', null)
        .order('start_date', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Tournament | null;
    },
  });

  // Local edits buffer for the inline editor
  const [edits, setEdits] = useState<Record<string, Partial<RewardRow>>>({});

  const saveRow = useMutation({
    mutationFn: async (id: string) => {
      const patch = edits[id];
      if (!patch) return;
      const { error } = await supabase
        .from('rewards')
        .update({
          usd_cost: patch.usd_cost ?? null,
          fulfillment_overhead_usd: patch.fulfillment_overhead_usd ?? null,
          redemption_frequency_weight: patch.redemption_frequency_weight ?? null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      setEdits((e) => {
        const n = { ...e };
        delete n[id];
        return n;
      });
      qc.invalidateQueries({ queryKey: ['admin', 'economics', 'rewards'] });
      toast.success('Saved');
    },
    onError: (e: any) => toast.error(`Save failed: ${e.message}`),
  });

  const valueOf = (row: RewardRow, key: keyof RewardRow): any => {
    const e = edits[row.id];
    if (e && key in e) return (e as any)[key];
    return (row as any)[key];
  };

  const setVal = (id: string, key: keyof RewardRow, raw: string) => {
    const num = raw.trim() === '' ? null : Number(raw);
    setEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), [key]: num },
    }));
  };

  // === Computed economics ===
  const economics = useMemo(() => {
    if (!rewards || rewards.length === 0) return null;

    // Effective weights: if all null, treat all as equal-weight
    const anyWeight = rewards.some((r) => r.redemption_frequency_weight != null);
    const rawWeights = rewards.map((r) =>
      anyWeight ? Number(r.redemption_frequency_weight || 0) : 1,
    );
    const totalWeight = rawWeights.reduce((s, w) => s + w, 0);

    const rowsWithMissing = rewards.filter(
      (r) => r.usd_cost == null,
    );

    // Per-reward cost-per-token
    const perReward = rewards.map((r, i) => {
      const wholesale = Number(r.usd_cost || 0);
      const overhead = Number(r.fulfillment_overhead_usd || 0);
      const totalCost = wholesale + overhead;
      const costPerToken = r.required_tokens > 0 ? totalCost / r.required_tokens : 0;
      const weight = totalWeight > 0 ? rawWeights[i] / totalWeight : 0;
      return { reward: r, wholesale, overhead, totalCost, costPerToken, weight };
    });

    const avgCostPerToken = perReward.reduce(
      (s, p) => s + p.weight * p.costPerToken,
      0,
    );

    // Revenue per token from Stripe deposits
    const grossRevenuePerToken =
      deposits && deposits.totalTokens > 0
        ? deposits.totalUsd / deposits.totalTokens
        : 0;
    // Stripe fees ~2.9% + 30c → estimate net at 95% of gross for back-of-envelope
    const netRevenuePerToken = grossRevenuePerToken * 0.95;

    const marginPerToken = netRevenuePerToken - avgCostPerToken;

    // YTD actual cost: sum tokens_spent × per-reward cost-per-token for each redemption
    const ytdActualCost =
      redemptions?.reduce((s, r: any) => {
        const pr = perReward.find((p) => p.reward.id === r.reward_id);
        if (!pr) return s;
        return s + Number(r.tokens_spent || 0) * pr.costPerToken;
      }, 0) || 0;

    const ytdTokensRedeemed =
      redemptions?.reduce((s, r: any) => s + Number(r.tokens_spent || 0), 0) ||
      0;

    // Outstanding liability
    const outstandingTokens = wallets?.outstanding || 0;
    const outstandingLiabilityUsd = outstandingTokens * avgCostPerToken;

    // Bankroll target for next capped event
    // Scenario D worst-case scales linearly with handle vs 600k baseline
    let bankrollTarget: { tokens: number; usd: number; baseHandle: number } | null = null;
    if (nextEvent && nextEvent.max_handle_tokens) {
      const handleRatio = nextEvent.max_handle_tokens / 600_000;
      const worstCaseTokens = WORST_CASE_D_AT_600K_HANDLE_TOKENS * handleRatio;
      bankrollTarget = {
        tokens: 2 * worstCaseTokens,
        usd: 2 * worstCaseTokens * avgCostPerToken,
        baseHandle: nextEvent.max_handle_tokens,
      };
    }

    return {
      perReward,
      avgCostPerToken,
      grossRevenuePerToken,
      netRevenuePerToken,
      marginPerToken,
      ytdActualCost,
      ytdTokensRedeemed,
      outstandingTokens,
      outstandingLiabilityUsd,
      bankrollTarget,
      rowsWithMissing: rowsWithMissing.length,
      totalRewards: rewards.length,
    };
  }, [rewards, deposits, redemptions, wallets, nextEvent]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            Token Economics
          </h2>
          <p className="text-muted-foreground">
            Single source of truth for token cost basis, margin, and event-level bankroll targets.
          </p>
        </div>

        {economics && economics.rowsWithMissing > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Missing cost data</AlertTitle>
            <AlertDescription>
              {economics.rowsWithMissing} of {economics.totalRewards} rewards have no wholesale cost
              set. Computed averages exclude them and will understate true exposure. Fill in the
              table below to ground these numbers in reality.
            </AlertDescription>
          </Alert>
        )}

        {/* Headline metrics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg cost per token</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                {economics ? fmtUsd(economics.avgCostPerToken, 4) : '—'}
                {economics && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <Info className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-96 text-xs space-y-1">
                      <div className="font-medium">Weighted breakdown</div>
                      {economics.perReward.map((p) => (
                        <div key={p.reward.id} className="flex justify-between">
                          <span className="truncate">{p.reward.name}</span>
                          <span className="font-mono">
                            {(p.weight * 100).toFixed(0)}% × {fmtUsd(p.costPerToken, 5)}
                          </span>
                        </div>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Cost we pay per token redeemed (weighted by redemption mix).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Net revenue per token</CardDescription>
              <CardTitle className="text-2xl">
                {economics ? fmtUsd(economics.netRevenuePerToken, 4) : '—'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Avg Stripe revenue per purchased token, net of ~5% fees.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Margin per token</CardDescription>
              <CardTitle
                className={`text-2xl ${
                  economics && economics.marginPerToken < 0 ? 'text-destructive' : 'text-emerald-600'
                }`}
              >
                {economics ? fmtUsd(economics.marginPerToken, 4) : '—'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                Net revenue minus weighted avg cost. Negative = losing money per token sold.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outstanding liability</CardDescription>
              <CardTitle className="text-2xl">
                {economics ? fmtUsd(economics.outstandingLiabilityUsd) : '—'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {fmtNum(economics?.outstandingTokens)} tokens unredeemed × avg cost.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* YTD + bankroll target */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Redemptions YTD
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tokens redeemed</span>
                <span className="font-mono">{fmtNum(economics?.ytdTokensRedeemed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Actual fulfillment cost</span>
                <span className="font-mono">{fmtUsd(economics?.ytdActualCost)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Bankroll target — next capped event
              </CardTitle>
              <CardDescription>
                2 × Scenario-D-with-caps worst case × avg cost per token.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!nextEvent && (
                <p className="text-sm text-muted-foreground">
                  No upcoming events with a handle cap configured.
                </p>
              )}
              {nextEvent && economics?.bankrollTarget && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Event</span>
                    <span>{nextEvent.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Handle cap</span>
                    <span className="font-mono">
                      {fmtNum(economics.bankrollTarget.baseHandle)} tokens
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Worst-case loss (caps + pile-on)</span>
                    <span className="font-mono">
                      {fmtNum(Math.round(economics.bankrollTarget.tokens / 2))} tokens
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-medium">
                    <span>Required bankroll (2× buffer)</span>
                    <span className="font-mono">{fmtUsd(economics.bankrollTarget.usd)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Reward catalog editor */}
        <Card>
          <CardHeader>
            <CardTitle>Reward catalog cost basis</CardTitle>
            <CardDescription>
              Wholesale cost = what we pay to fulfill. Overhead = shipping/processing/time. Weight =
              relative share of expected redemption mix (any units; auto-normalized).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingRewards && <p className="text-sm text-muted-foreground">Loading…</p>}
            {rewards && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reward</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Wholesale $</TableHead>
                    <TableHead className="text-right">Overhead $</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">$/token</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rewards.map((r) => {
                    const wholesale = Number(valueOf(r, 'usd_cost') || 0);
                    const overhead = Number(valueOf(r, 'fulfillment_overhead_usd') || 0);
                    const cpt =
                      r.required_tokens > 0 ? (wholesale + overhead) / r.required_tokens : 0;
                    const dirty = !!edits[r.id];
                    const missing = valueOf(r, 'usd_cost') == null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground flex gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[10px] py-0">{r.category}</Badge>
                            {r.tier && (
                              <Badge variant="outline" className="text-[10px] py-0">{r.tier}</Badge>
                            )}
                            {missing && (
                              <Badge variant="destructive" className="text-[10px] py-0">
                                no cost
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmtNum(r.required_tokens)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            className="h-8 w-24 ml-auto text-right"
                            value={valueOf(r, 'usd_cost') ?? ''}
                            onChange={(e) => setVal(r.id, 'usd_cost', e.target.value)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            className="h-8 w-24 ml-auto text-right"
                            value={valueOf(r, 'fulfillment_overhead_usd') ?? ''}
                            onChange={(e) =>
                              setVal(r.id, 'fulfillment_overhead_usd', e.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="1"
                            min={0}
                            className="h-8 w-20 ml-auto text-right"
                            value={valueOf(r, 'redemption_frequency_weight') ?? ''}
                            onChange={(e) =>
                              setVal(r.id, 'redemption_frequency_weight', e.target.value)
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtUsd(cpt, 5)}</TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant={dirty ? 'default' : 'outline'}
                            disabled={!dirty || saveRow.isPending}
                            onClick={() => saveRow.mutate(r.id)}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Save
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
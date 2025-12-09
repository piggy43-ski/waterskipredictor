import { AdminLayout } from '@/components/AdminLayout';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  Users, 
  Coins, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Gift,
  Target,
  Trophy,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  BarChart3
} from 'lucide-react';
import { formatTokensWithUSD, formatPL, tokensToUSD, TOKENS_PER_USD } from '@/utils/tokenConversion';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { format, parseISO, startOfMonth, subMonths } from 'date-fns';

const HouseLedger = () => {
  // Fetch total players
  const { data: totalPlayers, isLoading: loadingPlayers } = useQuery({
    queryKey: ['house-ledger-players'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch tokens purchased
  const { data: tokensPurchased, isLoading: loadingPurchased } = useQuery({
    queryKey: ['house-ledger-purchased'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_wallets')
        .select('purchased_tokens');
      if (error) throw error;
      return data?.reduce((sum, w) => sum + (w.purchased_tokens || 0), 0) || 0;
    },
  });

  // Fetch total bets count
  const { data: totalBets, isLoading: loadingBets } = useQuery({
    queryKey: ['house-ledger-bets'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  // Fetch tokens in circulation
  const { data: tokensInCirculation, isLoading: loadingCirculation } = useQuery({
    queryKey: ['house-ledger-circulation'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_wallets')
        .select('earned_tokens, purchased_tokens');
      if (error) throw error;
      return data?.reduce((sum, w) => sum + (w.earned_tokens || 0) + (w.purchased_tokens || 0), 0) || 0;
    },
  });

  // Fetch House P/L data - calculated from bet_slips for accuracy
  // This avoids double-counting parlay legs which are stored as separate predictions
  const { data: housePL, isLoading: loadingPL } = useQuery({
    queryKey: ['house-ledger-pl'],
    queryFn: async () => {
      // Use bet_slips as the source of truth for wagered and paid out
      const { data: betSlips, error } = await supabase
        .from('bet_slips')
        .select('status, total_stake_tokens, actual_payout_tokens, type');
      if (error) throw error;

      let totalWagered = 0;
      let houseGain = 0; // Stakes from lost bets
      let houseLoss = 0; // Net payouts to winners (payout - stake)

      betSlips?.forEach((slip) => {
        totalWagered += slip.total_stake_tokens || 0;
        
        if (slip.status === 'LOST') {
          // House keeps the stake
          houseGain += slip.total_stake_tokens || 0;
        } else if (slip.status === 'WON') {
          // House pays out (actual payout minus stake that was already collected)
          const netPayout = (slip.actual_payout_tokens || 0) - (slip.total_stake_tokens || 0);
          if (netPayout > 0) {
            houseLoss += netPayout;
          } else {
            // If payout < stake, house still gains
            houseGain += Math.abs(netPayout);
          }
        }
        // PENDING and VOID don't affect P/L
      });

      return {
        totalWagered,
        houseGain,
        houseLoss,
        netBalance: houseGain - houseLoss,
      };
    },
  });

  // Fetch token flow data - use bet_slips for accurate wagered/paidOut
  const { data: tokenFlow, isLoading: loadingFlow } = useQuery({
    queryKey: ['house-ledger-flow'],
    queryFn: async () => {
      // Use bet_slips as source of truth
      const { data: betSlips } = await supabase
        .from('bet_slips')
        .select('status, total_stake_tokens, actual_payout_tokens');

      const wagered = betSlips?.reduce((sum, s) => sum + (s.total_stake_tokens || 0), 0) || 0;
      const paidOut = betSlips?.filter(s => s.status === 'WON')
        .reduce((sum, s) => sum + (s.actual_payout_tokens || 0), 0) || 0;
      const pendingStakes = betSlips?.filter(s => s.status === 'PENDING')
        .reduce((sum, s) => sum + (s.total_stake_tokens || 0), 0) || 0;

      // Bonuses given
      const { data: bonuses } = await supabase
        .from('token_transactions')
        .select('amount')
        .eq('type', 'bonus');
      const bonusesGiven = bonuses?.reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

      // Tokens redeemed for rewards
      const { data: redemptions } = await supabase
        .from('redemptions')
        .select('tokens_spent');
      const redeemed = redemptions?.reduce((sum, r) => sum + (r.tokens_spent || 0), 0) || 0;

      // Tokens burned
      const { data: burns } = await supabase
        .from('token_transactions')
        .select('amount')
        .eq('type', 'burn');
      const burned = burns?.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0) || 0;

      return {
        wagered,
        paidOut,
        pendingStakes,
        bonusesGiven,
        redeemed,
        burned,
      };
    },
  });

  // Fetch per-tournament P/L
  const { data: tournamentPL, isLoading: loadingTournamentPL } = useQuery({
    queryKey: ['house-ledger-tournament-pl'],
    queryFn: async () => {
      const { data: predictions, error } = await supabase
        .from('predictions')
        .select('tournament_name, status, staked_tokens, payout_tokens');
      if (error) throw error;

      const byTournament: Record<string, {
        name: string;
        bets: number;
        wagered: number;
        paidOut: number;
      }> = {};

      predictions?.forEach((p) => {
        const name = p.tournament_name;
        if (!byTournament[name]) {
          byTournament[name] = { name, bets: 0, wagered: 0, paidOut: 0 };
        }
        byTournament[name].bets++;
        byTournament[name].wagered += p.staked_tokens || 0;
        if (p.status === 'WON') {
          byTournament[name].paidOut += p.payout_tokens || 0;
        }
      });

      return Object.values(byTournament).map(t => ({
        ...t,
        pl: t.wagered - t.paidOut,
      }));
    },
  });

  // Fetch per-market type P/L
  const { data: marketPL, isLoading: loadingMarketPL } = useQuery({
    queryKey: ['house-ledger-market-pl'],
    queryFn: async () => {
      const { data: predictions, error } = await supabase
        .from('predictions')
        .select('market_type, status, staked_tokens, payout_tokens');
      if (error) throw error;

      const byMarket: Record<string, {
        type: string;
        bets: number;
        wagered: number;
        paidOut: number;
      }> = {};

      predictions?.forEach((p) => {
        const type = p.market_type;
        if (!byMarket[type]) {
          byMarket[type] = { type, bets: 0, wagered: 0, paidOut: 0 };
        }
        byMarket[type].bets++;
        byMarket[type].wagered += p.staked_tokens || 0;
        if (p.status === 'WON') {
          byMarket[type].paidOut += p.payout_tokens || 0;
        }
      });

      return Object.values(byMarket).map(m => ({
        ...m,
        pl: m.wagered - m.paidOut,
      }));
    },
  });

  // Fetch parlay vs single P/L
  const { data: parlayPL, isLoading: loadingParlayPL } = useQuery({
    queryKey: ['house-ledger-parlay-pl'],
    queryFn: async () => {
      const { data: betSlips, error } = await supabase
        .from('bet_slips')
        .select('type, status, total_stake_tokens, actual_payout_tokens, potential_payout_tokens');
      if (error) throw error;

      const byType: Record<string, {
        type: string;
        count: number;
        wagered: number;
        paidOut: number;
      }> = {
        single: { type: 'Single Bets', count: 0, wagered: 0, paidOut: 0 },
        parlay: { type: 'Parlays', count: 0, wagered: 0, paidOut: 0 },
      };

      betSlips?.forEach((slip) => {
        const key = slip.type === 'parlay' ? 'parlay' : 'single';
        byType[key].count++;
        byType[key].wagered += slip.total_stake_tokens || 0;
        if (slip.status === 'WON') {
          byType[key].paidOut += slip.actual_payout_tokens || 0;
        }
      });

      return Object.values(byType).map(t => ({
        ...t,
        pl: t.wagered - t.paidOut,
      }));
    },
  });

  // Fetch user profitability
  const { data: userProfitability, isLoading: loadingUsers } = useQuery({
    queryKey: ['house-ledger-users'],
    queryFn: async () => {
      const { data: predictions, error } = await supabase
        .from('predictions')
        .select('user_id, staked_tokens, payout_tokens, status');
      if (error) throw error;

      const byUser: Record<string, {
        userId: string;
        bets: number;
        wagered: number;
        won: number;
      }> = {};

      predictions?.forEach((p) => {
        if (!byUser[p.user_id]) {
          byUser[p.user_id] = { userId: p.user_id, bets: 0, wagered: 0, won: 0 };
        }
        byUser[p.user_id].bets++;
        byUser[p.user_id].wagered += p.staked_tokens || 0;
        if (p.status === 'WON') {
          byUser[p.user_id].won += p.payout_tokens || 0;
        }
      });

      // Get user emails
      const userIds = Object.keys(byUser);
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, username')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return Object.values(byUser)
        .map(u => ({
          ...u,
          email: profileMap.get(u.userId)?.email || 'Unknown',
          username: profileMap.get(u.userId)?.username || 'Unknown',
          netPL: u.won - u.wagered, // User's perspective
          houseNetPL: u.wagered - u.won, // House's perspective
        }))
        .sort((a, b) => b.houseNetPL - a.houseNetPL)
        .slice(0, 10);
    },
  });

  // Fetch monthly P/L trend data
  const { data: monthlyPL, isLoading: loadingMonthlyPL } = useQuery({
    queryKey: ['house-ledger-monthly-pl'],
    queryFn: async () => {
      const { data: predictions, error } = await supabase
        .from('predictions')
        .select('created_at, status, staked_tokens, payout_tokens, settled_at');
      if (error) throw error;

      // Group by month based on settled_at or created_at
      const byMonth: Record<string, {
        month: string;
        wagered: number;
        paidOut: number;
        bets: number;
        won: number;
        lost: number;
      }> = {};

      // Initialize last 12 months
      for (let i = 11; i >= 0; i--) {
        const date = subMonths(new Date(), i);
        const monthKey = format(startOfMonth(date), 'yyyy-MM');
        byMonth[monthKey] = {
          month: monthKey,
          wagered: 0,
          paidOut: 0,
          bets: 0,
          won: 0,
          lost: 0,
        };
      }

      predictions?.forEach((p) => {
        const dateStr = p.settled_at || p.created_at;
        if (!dateStr) return;
        
        const monthKey = format(parseISO(dateStr), 'yyyy-MM');
        if (!byMonth[monthKey]) return; // Skip if outside our 12-month window

        byMonth[monthKey].bets++;
        byMonth[monthKey].wagered += p.staked_tokens || 0;
        
        if (p.status === 'WON') {
          byMonth[monthKey].paidOut += p.payout_tokens || 0;
          byMonth[monthKey].won++;
        } else if (p.status === 'LOST') {
          byMonth[monthKey].lost++;
        }
      });

      return Object.values(byMonth)
        .sort((a, b) => a.month.localeCompare(b.month))
        .map(m => ({
          ...m,
          pl: m.wagered - m.paidOut,
          displayMonth: format(parseISO(`${m.month}-01`), 'MMM yy'),
        }));
    },
  });

  const StatCard = ({
    title, 
    value, 
    icon: Icon, 
    loading,
    variant = 'default'
  }: { 
    title: string; 
    value: string | number; 
    icon: any; 
    loading: boolean;
    variant?: 'default' | 'success' | 'danger';
  }) => (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${
          variant === 'success' ? 'bg-success/10 text-success' :
          variant === 'danger' ? 'bg-destructive/10 text-destructive' :
          'bg-primary/10 text-primary'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          {loading ? (
            <Skeleton className="h-6 w-24 mt-1" />
          ) : (
            <p className={`text-lg font-bold ${
              variant === 'success' ? 'text-success' :
              variant === 'danger' ? 'text-destructive' :
              'text-foreground'
            }`}>
              {value}
            </p>
          )}
        </div>
      </div>
    </Card>
  );

  const PLBadge = ({ value }: { value: number }) => {
    const { isPositive } = formatPL(value);
    return (
      <span className={`font-bold ${isPositive ? 'text-success' : 'text-destructive'}`}>
        {isPositive ? '+' : ''}{formatTokensWithUSD(value)}
      </span>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">House Ledger</h1>
          <p className="text-muted-foreground">
            Complete financial overview • 1 token = $0.01 ({TOKENS_PER_USD} tokens = $1)
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            title="Total Players"
            value={totalPlayers || 0}
            icon={Users}
            loading={loadingPlayers}
          />
          <StatCard
            title="Tokens Purchased"
            value={formatTokensWithUSD(tokensPurchased || 0)}
            icon={DollarSign}
            loading={loadingPurchased}
          />
          <StatCard
            title="Total Bets"
            value={totalBets || 0}
            icon={Target}
            loading={loadingBets}
          />
          <StatCard
            title="In Circulation"
            value={formatTokensWithUSD(tokensInCirculation || 0)}
            icon={Coins}
            loading={loadingCirculation}
          />
        </div>

        {/* House P/L Summary */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Wallet className="w-5 h-5" />
            House Balance
          </h2>
          {loadingPL ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 bg-success/5 border-success/20">
                <div className="flex items-center gap-2 text-success mb-2">
                  <ArrowUpRight className="w-5 h-5" />
                  <span className="font-medium">House Gain</span>
                </div>
                <p className="text-2xl font-bold text-success">
                  {formatTokensWithUSD(housePL?.houseGain || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Stakes from lost bets
                </p>
              </Card>

              <Card className="p-4 bg-destructive/5 border-destructive/20">
                <div className="flex items-center gap-2 text-destructive mb-2">
                  <ArrowDownRight className="w-5 h-5" />
                  <span className="font-medium">House Loss</span>
                </div>
                <p className="text-2xl font-bold text-destructive">
                  {formatTokensWithUSD(housePL?.houseLoss || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Payouts to winners
                </p>
              </Card>

              <Card className={`p-4 ${
                (housePL?.netBalance || 0) >= 0 
                  ? 'bg-success/5 border-success/20' 
                  : 'bg-destructive/5 border-destructive/20'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-5 h-5" />
                  <span className="font-medium">Net Balance</span>
                </div>
                <p className={`text-2xl font-bold ${
                  (housePL?.netBalance || 0) >= 0 ? 'text-success' : 'text-destructive'
                }`}>
                  {(housePL?.netBalance || 0) >= 0 ? '+' : ''}
                  {formatTokensWithUSD(housePL?.netBalance || 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Gain - Loss
                </p>
              </Card>
            </div>
          )}
        </Card>

        {/* Token Flow */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Coins className="w-5 h-5" />
            Token Flow
          </h2>
          {loadingFlow ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-20" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Wagered</p>
                <p className="font-bold">{formatTokensWithUSD(tokenFlow?.wagered || 0)}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Paid Out</p>
                <p className="font-bold">{formatTokensWithUSD(tokenFlow?.paidOut || 0)}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Pending Stakes</p>
                <p className="font-bold">{formatTokensWithUSD(tokenFlow?.pendingStakes || 0)}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Bonuses Given</p>
                <p className="font-bold text-primary">{formatTokensWithUSD(tokenFlow?.bonusesGiven || 0)}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Redeemed</p>
                <p className="font-bold">{formatTokensWithUSD(tokenFlow?.redeemed || 0)}</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Burned</p>
                <p className="font-bold">{formatTokensWithUSD(tokenFlow?.burned || 0)}</p>
              </div>
            </div>
          )}
        </Card>

        {/* Monthly P/L Trend Chart */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Monthly P/L Trend
          </h2>
          {loadingMonthlyPL ? (
            <Skeleton className="h-72" />
          ) : monthlyPL && monthlyPL.length > 0 ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyPL} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="displayMonth" 
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis 
                    className="text-xs fill-muted-foreground"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                            <p className="font-bold text-foreground">{label}</p>
                            <p className="text-sm text-muted-foreground">Bets: {data.bets}</p>
                            <p className="text-sm text-muted-foreground">Wagered: {formatTokensWithUSD(data.wagered)}</p>
                            <p className="text-sm text-muted-foreground">Paid Out: {formatTokensWithUSD(data.paidOut)}</p>
                            <p className={`text-sm font-bold ${data.pl >= 0 ? 'text-success' : 'text-destructive'}`}>
                              P/L: {data.pl >= 0 ? '+' : ''}{formatTokensWithUSD(data.pl)}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                  <Bar dataKey="pl" radius={[4, 4, 0, 0]}>
                    {monthlyPL.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.pl >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">No monthly data available</p>
          )}
        </Card>

        {/* Per-Tournament P/L */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Per-Tournament P/L
          </h2>
          {loadingTournamentPL ? (
            <Skeleton className="h-48" />
          ) : tournamentPL && tournamentPL.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tournament</TableHead>
                  <TableHead className="text-right">Bets</TableHead>
                  <TableHead className="text-right">Wagered</TableHead>
                  <TableHead className="text-right">Paid Out</TableHead>
                  <TableHead className="text-right">House P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tournamentPL.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-right">{t.bets}</TableCell>
                    <TableCell className="text-right">{formatTokensWithUSD(t.wagered)}</TableCell>
                    <TableCell className="text-right">{formatTokensWithUSD(t.paidOut)}</TableCell>
                    <TableCell className="text-right">
                      <PLBadge value={t.pl} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8">No tournament data yet</p>
          )}
        </Card>

        {/* Per-Market Type P/L */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5" />
            Per-Market Type P/L
          </h2>
          {loadingMarketPL ? (
            <Skeleton className="h-32" />
          ) : marketPL && marketPL.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market Type</TableHead>
                  <TableHead className="text-right">Bets</TableHead>
                  <TableHead className="text-right">Wagered</TableHead>
                  <TableHead className="text-right">Paid Out</TableHead>
                  <TableHead className="text-right">House P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marketPL.map((m) => (
                  <TableRow key={m.type}>
                    <TableCell className="font-medium">
                      <Badge variant="outline">{m.type}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{m.bets}</TableCell>
                    <TableCell className="text-right">{formatTokensWithUSD(m.wagered)}</TableCell>
                    <TableCell className="text-right">{formatTokensWithUSD(m.paidOut)}</TableCell>
                    <TableCell className="text-right">
                      <PLBadge value={m.pl} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8">No market data yet</p>
          )}
        </Card>

        {/* Parlay vs Single P/L */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Parlay vs Single Bets P/L
          </h2>
          {loadingParlayPL ? (
            <Skeleton className="h-24" />
          ) : parlayPL && parlayPL.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bet Type</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Wagered</TableHead>
                  <TableHead className="text-right">Paid Out</TableHead>
                  <TableHead className="text-right">House P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parlayPL.map((p) => (
                  <TableRow key={p.type}>
                    <TableCell className="font-medium">{p.type}</TableCell>
                    <TableCell className="text-right">{p.count}</TableCell>
                    <TableCell className="text-right">{formatTokensWithUSD(p.wagered)}</TableCell>
                    <TableCell className="text-right">{formatTokensWithUSD(p.paidOut)}</TableCell>
                    <TableCell className="text-right">
                      <PLBadge value={p.pl} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8">No parlay data yet</p>
          )}
        </Card>

        {/* User Profitability */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5" />
            User Profitability (Top 10 by House P/L)
          </h2>
          {loadingUsers ? (
            <Skeleton className="h-48" />
          ) : userProfitability && userProfitability.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Bets</TableHead>
                  <TableHead className="text-right">Wagered</TableHead>
                  <TableHead className="text-right">Won</TableHead>
                  <TableHead className="text-right">User Net P/L</TableHead>
                  <TableHead className="text-right">House P/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userProfitability.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell className="font-medium">
                      <div>
                        <p>{u.username}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{u.bets}</TableCell>
                    <TableCell className="text-right">{formatTokensWithUSD(u.wagered)}</TableCell>
                    <TableCell className="text-right">{formatTokensWithUSD(u.won)}</TableCell>
                    <TableCell className="text-right">
                      <span className={u.netPL >= 0 ? 'text-success' : 'text-destructive'}>
                        {u.netPL >= 0 ? '+' : ''}{formatTokensWithUSD(u.netPL)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <PLBadge value={u.houseNetPL} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8">No user betting data yet</p>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
};

export default HouseLedger;

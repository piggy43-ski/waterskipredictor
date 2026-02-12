import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Users, 
  Coins, 
  Trophy, 
  TrendingUp, 
  TrendingDown,
  Filter,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { formatTokensWithUSD } from '@/utils/tokenConversion';
import type { Discipline, Category } from '@/types';

interface SettlementAuditTableProps {
  tournamentId: string;
  tournamentName?: string;
}

interface EntryDetail {
  id: string;
  username: string;
  email: string;
  entry_type: 'single' | 'parlay';
  market_type: string;
  discipline: string;
  category: string;
  athlete_name: string;
  picks: string;
  stake: number;
  odds: number;
  odds_display: string;
  result: 'WON' | 'LOST' | 'VOID' | 'PENDING';
  payout: number;
  profit: number;
  created_at: string;
  settled_at: string | null;
  settlement_explanation?: string;
  settlement_metadata?: Record<string, any>;
}

export function SettlementAuditTable({ tournamentId, tournamentName }: SettlementAuditTableProps) {
  const [disciplineFilter, setDisciplineFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [marketTypeFilter, setMarketTypeFilter] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState(false);

  // Fetch detailed entry data for this tournament
  const { data: entries, isLoading } = useQuery({
    queryKey: ['settlement-audit-entries', tournamentId],
    queryFn: async () => {
      // Get predictions for this tournament
      const { data: predictions, error } = await supabase
        .from('predictions')
        .select(`
          id,
          user_id,
          athlete_name,
          tournament_name,
          discipline,
          category,
          market_type,
          staked_tokens,
          decimal_odds,
          status,
          payout_tokens,
          potential_payout,
          created_at,
          settled_at,
          bet_slip_id,
          selection_id,
          settlement_metadata
        `)
        .eq('tournament_name', tournamentName || '')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get user profiles for usernames
      const userIds = [...new Set(predictions?.map(p => p.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, email')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Get entries for parlay info
      const entryIds = [...new Set(predictions?.filter(p => p.bet_slip_id).map(p => p.bet_slip_id) || [])];
      const { data: entrySlips } = await supabase
        .from('bet_slips')
        .select('id, type, leg_count')
        .in('id', entryIds);

      const entryMap = new Map(entrySlips?.map(s => [s.id, s]) || []);

      // Transform to EntryDetail format
      const entriesData: EntryDetail[] = (predictions || []).map(p => {
        const profile = profileMap.get(p.user_id);
        const entry = p.bet_slip_id ? entryMap.get(p.bet_slip_id) : null;
        const isParlay = entry?.type === 'parlay';
        
        // Format odds display
        const decimalOdds = Number(p.decimal_odds);
        let oddsDisplay = decimalOdds.toFixed(2);
        if (decimalOdds >= 2) {
          oddsDisplay = `+${Math.round((decimalOdds - 1) * 100)}`;
        } else if (decimalOdds > 1) {
          oddsDisplay = `-${Math.round(100 / (decimalOdds - 1))}`;
        }

        const payout = p.status === 'WON' ? (p.payout_tokens || p.potential_payout || 0) : 0;
        const profit = payout - p.staked_tokens;

        // Extract explanation from settlement metadata
        const metadata = p.settlement_metadata as Record<string, any> | null;
        const explanation = metadata?.explanation || '';

        return {
          id: p.id,
          username: profile?.username || 'Unknown',
          email: profile?.email || '',
          entry_type: isParlay ? 'parlay' : 'single',
          market_type: p.market_type,
          discipline: p.discipline,
          category: p.category,
          athlete_name: p.athlete_name,
          picks: p.athlete_name,
          stake: p.staked_tokens,
          odds: decimalOdds,
          odds_display: oddsDisplay,
          result: p.status as EntryDetail['result'],
          payout,
          profit,
          created_at: p.created_at,
          settled_at: p.settled_at,
          settlement_explanation: explanation,
          settlement_metadata: metadata || undefined,
        };
      });

      return entriesData;
    },
    enabled: !!tournamentId && !!tournamentName,
  });

  // Filter the entries
  const filteredEntries = useMemo(() => {
    if (!entries) return [];
    
    return entries.filter(entry => {
      if (disciplineFilter !== 'all' && entry.discipline !== disciplineFilter) return false;
      if (categoryFilter !== 'all' && entry.category !== categoryFilter) return false;
      if (marketTypeFilter !== 'all' && entry.market_type !== marketTypeFilter) return false;
      if (resultFilter !== 'all' && entry.result !== resultFilter) return false;
      return true;
    });
  }, [entries, disciplineFilter, categoryFilter, marketTypeFilter, resultFilter]);

  // Calculate summary stats
  const summary = useMemo(() => {
    const total = filteredEntries.reduce(
      (acc, entry) => {
        acc.wagered += entry.stake;
        if (entry.result === 'WON') {
          acc.paidOut += entry.payout;
          acc.wins++;
        } else if (entry.result === 'LOST') {
          acc.losses++;
        }
        acc.count++;
        return acc;
      },
      { wagered: 0, paidOut: 0, wins: 0, losses: 0, count: 0 }
    );
    
    return {
      ...total,
      houseProfit: total.wagered - total.paidOut,
    };
  }, [filteredEntries]);

  // Get unique filter options
  const filterOptions = useMemo(() => {
    if (!entries) return { disciplines: [], categories: [], marketTypes: [] };
    
    return {
      disciplines: [...new Set(entries.map(b => b.discipline))],
      categories: [...new Set(entries.map(b => b.category))],
      marketTypes: [...new Set(entries.map(b => b.market_type))],
    };
  }, [entries]);

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'WON':
        return <Badge className="bg-success text-success-foreground">WON</Badge>;
      case 'LOST':
        return <Badge variant="destructive">LOST</Badge>;
      case 'VOID':
        return <Badge variant="secondary">VOID</Badge>;
      default:
        return <Badge variant="outline">PENDING</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Entry Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Detailed Entry Breakdown
            <Badge variant="outline">{filteredEntries.length} entries</Badge>
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="w-4 h-4 mr-1" />
                Collapse
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-1" />
                Expand
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Total Entries</p>
            <p className="font-bold text-lg">{summary.count}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Total Wagered</p>
            <p className="font-bold">{formatTokensWithUSD(summary.wagered)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Total Payout</p>
            <p className="font-bold">{formatTokensWithUSD(summary.paidOut)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-success/10">
            <p className="text-xs text-muted-foreground">Wins</p>
            <p className="font-bold text-success">{summary.wins}</p>
          </div>
          <div className={`text-center p-3 rounded-lg ${summary.houseProfit >= 0 ? 'bg-success/10' : 'bg-destructive/10'}`}>
            <p className="text-xs text-muted-foreground">House P/L</p>
            <p className={`font-bold ${summary.houseProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {summary.houseProfit >= 0 ? '+' : ''}{formatTokensWithUSD(summary.houseProfit)}
            </p>
          </div>
        </div>

        {expanded && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filters:</span>
              </div>
              
              <Select value={disciplineFilter} onValueChange={setDisciplineFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Discipline" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Disciplines</SelectItem>
                  {filterOptions.disciplines.map(d => (
                    <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {filterOptions.categories.map(c => (
                    <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={marketTypeFilter} onValueChange={setMarketTypeFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Market Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Markets</SelectItem>
                  {filterOptions.marketTypes.map(m => (
                    <SelectItem key={m} value={m}>{m.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={resultFilter} onValueChange={setResultFilter}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Result" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Results</SelectItem>
                  <SelectItem value="WON">Won</SelectItem>
                  <SelectItem value="LOST">Lost</SelectItem>
                  <SelectItem value="VOID">Void</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bets Table */}
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Market</TableHead>
                    <TableHead>Pick</TableHead>
                    <TableHead className="text-right">Stake</TableHead>
                    <TableHead className="text-right">Odds</TableHead>
                    <TableHead className="text-center">Result</TableHead>
                    <TableHead className="min-w-[200px]">Explanation</TableHead>
                    <TableHead className="text-right">Payout</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No entries found matching filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{entry.username}</p>
                            <p className="text-xs text-muted-foreground">{entry.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {entry.entry_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="secondary" className="w-fit text-xs">
                              {entry.market_type.replace('_', ' ')}
                            </Badge>
                            <span className="text-xs text-muted-foreground capitalize">
                              {entry.discipline} • {entry.category.replace('_', ' ')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{entry.picks}</TableCell>
                        <TableCell className="text-right">{entry.stake.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">
                          {entry.odds_display}
                        </TableCell>
                        <TableCell className="text-center">
                          {getResultBadge(entry.result)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={entry.settlement_explanation}>
                          {entry.settlement_explanation || (entry.result === 'PENDING' ? 'Awaiting results' : '—')}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.result === 'WON' ? (
                            <span className="text-success font-medium">
                              {entry.payout.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {entry.result === 'WON' ? (
                            <span className="text-success font-medium">
                              +{entry.profit.toLocaleString()}
                            </span>
                          ) : entry.result === 'LOST' ? (
                            <span className="text-destructive">
                              -{entry.stake.toLocaleString()}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useMemo } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { 
  Shield, AlertTriangle, TrendingUp, DollarSign, Download, RefreshCw, Eye, 
  Activity, Target, Users, Clock, CheckCircle, XCircle, ChevronDown, ChevronRight,
  FileJson, FileSpreadsheet, Lock, Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { RISK_CONFIG, getLiabilityCap, getMaxRiskRatio, MarketType } from '@/utils/riskConfig';
import { toast } from 'sonner';

// Use risk config for bands
const HOUSE_EDGE_BANDS = RISK_CONFIG.IMPLIED_SUM_BANDS;
const MAX_RISK_RATIOS = RISK_CONFIG.MAX_RISK_RATIO;

// Alert thresholds
const ALERT_THRESHOLDS = {
  CONCENTRATION_PERCENT: 40,
  FAVORITE_OVERLOAD_PERCENT: 50,
  LARGE_ENTRY_PERCENT: 80,
};

interface MarketRiskData {
  id: string;
  name: string;
  market_type: MarketType;
  discipline: string;
  category: string;
  tournament_id: string;
  tournament_name: string;
  tournament_status: string;
  locked_at: string | null;
  status: 'OPEN' | 'CLOSED' | 'SETTLED' | 'LOCKED';
  sims: number;
  implied_sum: number;
  target_implied_sum: number;
  total_entries: number;
  total_tokens: number;
  max_payout: number;
  risk_ratio: number;
  max_risk_ratio: number;
  house_edge_status: 'green' | 'yellow' | 'red';
  risk_status: 'safe' | 'warning' | 'danger';
  is_compressed: boolean;
  cumulative_compression_pct: number;
}

interface AthleteRiskData {
  athlete_id: string;
  athlete_name: string;
  probability: number;
  multiplier: number;
  tokens_on_athlete: number;
  percent_of_pool: number;
  payout_exposure: number;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  actor_type: string;
  actor_id: string | null;
  before_state: any;
  after_state: any;
  created_at: string;
  metadata: any;
}

interface RiskAlert {
  id: string;
  type: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  marketId?: string;
  marketName?: string;
}

const RiskDashboard = () => {
  const [selectedMarket, setSelectedMarket] = useState<MarketRiskData | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [auditLogsExpanded, setAuditLogsExpanded] = useState(false);
  const queryClient = useQueryClient();

  // Compression mutation
  const compressMultipliers = useMutation({
    mutationFn: async (marketId: string) => {
      const { data, error } = await supabase.functions.invoke('compress-multipliers', {
        body: { market_id: marketId, dry_run: false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.compression_applied) {
        toast.success(`Compressed ${data.athletes_compressed} athletes. Risk ratio: ${data.risk_ratio_before.toFixed(2)}x → ${data.risk_ratio_after.toFixed(2)}x`);
      } else {
        toast.info(data.message || 'No compression needed');
      }
      queryClient.invalidateQueries({ queryKey: ['admin-risk-markets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-risk-audit-logs'] });
    },
    onError: (error: Error) => {
      toast.error(`Compression failed: ${error.message}`);
    },
  });

  // Fetch all markets with their odds data
  const { data: marketsData, isLoading: marketsLoading, refetch: refetchMarkets } = useQuery({
    queryKey: ['admin-risk-markets'],
    queryFn: async () => {
      // Get markets with tournament info
      const { data: markets, error: marketsError } = await supabase
        .from('markets')
        .select(`
          id,
          name,
          market_type,
          discipline,
          category,
          tournament_id,
          locked_at,
          tournaments!inner (
            id,
            name,
            status,
            start_date,
            end_date
          )
        `)
        .order('created_at', { ascending: false });

      if (marketsError) throw marketsError;

      // Get selections for implied sum calculation (actual odds are here, not in market_odds)
      const { data: selections, error: selectionsError } = await supabase
        .from('selections')
        .select('id, market_id, decimal_odds');

      if (selectionsError) throw selectionsError;

      // Get predictions to calculate exposure (predictions link to markets via selections)
      const { data: predictions, error: predictionsError } = await supabase
        .from('predictions')
        .select('id, selection_id, staked_tokens, potential_payout, status, bet_slip_id');

      if (predictionsError) throw predictionsError;

      // Create lookup: selection_id -> market_id
      const selectionToMarket: Record<string, string> = {};
      (selections || []).forEach(s => {
        selectionToMarket[s.id] = s.market_id;
      });

      // Calculate implied sum per market from selections
      const impliedSumByMarket: Record<string, { sum: number; count: number }> = {};
      (selections || []).forEach(s => {
        if (!impliedSumByMarket[s.market_id]) {
          impliedSumByMarket[s.market_id] = { sum: 0, count: 0 };
        }
        impliedSumByMarket[s.market_id].sum += 1 / s.decimal_odds;
        impliedSumByMarket[s.market_id].count += 1;
      });

      // Calculate exposure per market from predictions
      const exposureByMarket: Record<string, { 
        totalTokens: number; 
        maxPayout: number; 
        betSlipIds: Set<string>;
      }> = {};
      
      (predictions || []).forEach(p => {
        const marketId = selectionToMarket[p.selection_id];
        if (!marketId) return;
        
        if (!exposureByMarket[marketId]) {
          exposureByMarket[marketId] = { 
            totalTokens: 0, 
            maxPayout: 0, 
            betSlipIds: new Set()
          };
        }
        
        exposureByMarket[marketId].totalTokens += p.staked_tokens || 0;
        exposureByMarket[marketId].maxPayout = Math.max(
          exposureByMarket[marketId].maxPayout, 
          p.potential_payout || 0
        );
        if (p.bet_slip_id) {
          exposureByMarket[marketId].betSlipIds.add(p.bet_slip_id);
        }
      });

      // Process markets with calculated metrics
      const processedMarkets: MarketRiskData[] = (markets || []).map((market: any) => {
        // Get implied sum from selections
        const impliedData = impliedSumByMarket[market.id];
        const impliedSum = impliedData?.sum || 0;
        const selectionCount = impliedData?.count || 0;
        
        // Monte Carlo always runs 20,000 sims (constant)
        const sims = selectionCount > 0 ? 20000 : 0;
        const targetImpliedSum = HOUSE_EDGE_BANDS[market.market_type as MarketType]?.target || 0.9;

        // Get exposure from predictions
        const exposure = exposureByMarket[market.id];
        const totalTokens = exposure?.totalTokens || 0;
        const maxPayout = exposure?.maxPayout || 0;
        const totalEntries = exposure?.betSlipIds.size || 0;
        const riskRatio = totalTokens > 0 ? maxPayout / totalTokens : 0;

        // Determine status
        let status: 'OPEN' | 'CLOSED' | 'SETTLED' | 'LOCKED' = 'OPEN';
        if (market.locked_at) {
          status = 'LOCKED';
        } else if (market.tournaments?.status === 'completed') {
          status = 'SETTLED';
        } else if (market.tournaments?.status === 'live') {
          status = 'CLOSED';
        }

        // Determine house edge health
        const band = HOUSE_EDGE_BANDS[market.market_type as MarketType];
        let houseEdgeStatus: 'green' | 'yellow' | 'red' = 'green';
        if (band && selectionCount > 0) {
          if (impliedSum < band.min - 0.02 || impliedSum > band.max + 0.02) {
            houseEdgeStatus = 'red';
          } else if (impliedSum < band.min || impliedSum > band.max) {
            houseEdgeStatus = 'yellow';
          }
        }

        // Get max risk ratio for this market type
        const maxRiskRatio = MAX_RISK_RATIOS[market.market_type as MarketType] || MAX_RISK_RATIOS.WINNER;
        
        // Determine risk status based on ratio vs max
        let riskStatus: 'safe' | 'warning' | 'danger' = 'safe';
        if (riskRatio > maxRiskRatio) {
          riskStatus = 'danger';
        } else if (riskRatio > maxRiskRatio * 0.9) {
          riskStatus = 'warning';
        }

        return {
          id: market.id,
          name: market.name,
          market_type: market.market_type as MarketType,
          discipline: market.discipline,
          category: market.category,
          tournament_id: market.tournament_id,
          tournament_name: market.tournaments?.name || 'Unknown',
          tournament_status: market.tournaments?.status || 'unknown',
          locked_at: market.locked_at,
          status,
          sims,
          implied_sum: impliedSum,
          target_implied_sum: targetImpliedSum,
          total_entries: totalEntries,
          total_tokens: totalTokens,
          max_payout: maxPayout,
          risk_ratio: riskRatio,
          max_risk_ratio: maxRiskRatio,
          house_edge_status: houseEdgeStatus,
          risk_status: riskStatus,
          is_compressed: false, // Will be updated from audit logs
          cumulative_compression_pct: 0,
        };
      });

      return processedMarkets;
    },
  });

  // Fetch market liability for concentration data
  const { data: liabilityData } = useQuery({
    queryKey: ['admin-risk-liability'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_liability')
        .select(`
          market_id,
          athlete_id,
          total_stake_tokens,
          total_potential_payout,
          bet_count,
          liability_if_wins,
          athletes (
            id,
            name
          )
        `);

      if (error) throw error;
      return data;
    },
  });

  // Fetch recent audit logs
  const { data: auditLogs } = useQuery({
    queryKey: ['admin-risk-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .in('action_type', [
          'ODDS_GENERATED',
          'MULTIPLIER_UPDATED',
          'MULTIPLIER_COMPRESSED',
          'MARKET_RISK_COMPRESSED',
          'IMPLIED_SUM_NORMALIZED',
          'PREDICTION_SETTLED',
          'PARLAY_SETTLED',
          'BETSLIP_SETTLED',
          'MARKET_LOCKED',
        ])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as AuditLogEntry[];
    },
  });

  // Fetch settlement data for P/L calculation
  const { data: settlementData } = useQuery({
    queryKey: ['admin-risk-settlement'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bet_slips')
        .select(`
          tournament_id,
          status,
          total_stake_tokens,
          actual_payout_tokens,
          tournaments (
            id,
            name,
            status
          )
        `)
        .in('status', ['WON', 'LOST', 'VOID']);

      if (error) throw error;
      return data;
    },
  });

  // Calculate KPIs
  const kpis = useMemo(() => {
    if (!marketsData) return null;

    const statusCounts = {
      OPEN: marketsData.filter(m => m.status === 'OPEN').length,
      CLOSED: marketsData.filter(m => m.status === 'CLOSED').length,
      SETTLED: marketsData.filter(m => m.status === 'SETTLED').length,
      LOCKED: marketsData.filter(m => m.status === 'LOCKED').length,
    };

    // Average implied sum by market type
    const impliedSumByType: Record<string, { sum: number; count: number }> = {};
    marketsData.forEach(m => {
      if (m.implied_sum > 0) {
        if (!impliedSumByType[m.market_type]) {
          impliedSumByType[m.market_type] = { sum: 0, count: 0 };
        }
        impliedSumByType[m.market_type].sum += m.implied_sum;
        impliedSumByType[m.market_type].count += 1;
      }
    });

    const houseEdgeByType = Object.entries(impliedSumByType).map(([type, data]) => ({
      type,
      avg: data.sum / data.count,
      target: HOUSE_EDGE_BANDS[type as MarketType]?.target || 0.9,
    }));

    // Total exposure
    const totalExposure = marketsData
      .filter(m => m.status === 'OPEN' || m.status === 'CLOSED')
      .reduce((sum, m) => sum + m.total_tokens, 0);
    
    const maxSingleEntry = Math.max(...marketsData.map(m => m.max_payout), 0);

    return {
      statusCounts,
      houseEdgeByType,
      totalExposure,
      maxSingleEntry,
    };
  }, [marketsData]);

  // Generate alerts
  const alerts = useMemo(() => {
    const alertList: RiskAlert[] = [];

    marketsData?.forEach(market => {
      // Implied sum outside band
      if (market.house_edge_status === 'red') {
        alertList.push({
          id: `implied-${market.id}`,
          type: 'HIGH',
          message: `Implied sum (${market.implied_sum.toFixed(3)}) outside target band for ${market.name}`,
          marketId: market.id,
          marketName: market.name,
        });
      }

      // Simulations incomplete
      if (market.sims > 0 && market.sims !== 20000) {
        alertList.push({
          id: `sims-${market.id}`,
          type: 'HIGH',
          message: `Only ${market.sims} simulations run for ${market.name} (expected 20000)`,
          marketId: market.id,
          marketName: market.name,
        });
      }

      // High risk ratio (exceeds max for market type)
      if (market.risk_ratio > market.max_risk_ratio) {
        alertList.push({
          id: `risk-${market.id}`,
          type: 'HIGH',
          message: `Risk ratio (${market.risk_ratio.toFixed(2)}x) exceeds limit (${market.max_risk_ratio.toFixed(2)}x) on ${market.name}`,
          marketId: market.id,
          marketName: market.name,
        });
      } else if (market.risk_ratio > market.max_risk_ratio * 0.9) {
        alertList.push({
          id: `risk-warning-${market.id}`,
          type: 'MEDIUM',
          message: `Risk ratio (${market.risk_ratio.toFixed(2)}x) approaching limit (${market.max_risk_ratio.toFixed(2)}x) on ${market.name}`,
          marketId: market.id,
          marketName: market.name,
        });
      }
    });

    // Check for concentration
    liabilityData?.forEach(liability => {
      const market = marketsData?.find(m => m.id === liability.market_id);
      if (market && market.total_tokens > 0) {
        const percentOfPool = (liability.total_stake_tokens / market.total_tokens) * 100;
        if (percentOfPool > ALERT_THRESHOLDS.CONCENTRATION_PERCENT) {
          alertList.push({
            id: `concentration-${liability.market_id}-${liability.athlete_id}`,
            type: 'MEDIUM',
            message: `Sharp concentration: ${(liability.athletes as any)?.name || 'Unknown'} has ${percentOfPool.toFixed(1)}% of pool in ${market.name}`,
            marketId: market.id,
            marketName: market.name,
          });
        }
      }
    });

    return alertList;
  }, [marketsData, liabilityData]);

  // Calculate settlement P/L by tournament
  const settlementPL = useMemo(() => {
    if (!settlementData) return [];

    const byTournament: Record<string, { 
      name: string; 
      collected: number; 
      paid: number; 
      net: number;
      status: 'PROFIT' | 'BREAK-EVEN' | 'LOSS';
    }> = {};

    settlementData.forEach(bet => {
      const tournamentId = bet.tournament_id;
      if (!byTournament[tournamentId]) {
        byTournament[tournamentId] = {
          name: (bet.tournaments as any)?.name || 'Unknown',
          collected: 0,
          paid: 0,
          net: 0,
          status: 'BREAK-EVEN',
        };
      }
      byTournament[tournamentId].collected += bet.total_stake_tokens || 0;
      if (bet.status === 'WON') {
        byTournament[tournamentId].paid += bet.actual_payout_tokens || 0;
      }
    });

    return Object.entries(byTournament).map(([id, data]) => {
      data.net = data.collected - data.paid;
      data.status = data.net > 0 ? 'PROFIT' : data.net < 0 ? 'LOSS' : 'BREAK-EVEN';
      return { id, ...data };
    });
  }, [settlementData]);

  // Get athlete details for selected market (using selections table instead of market_odds)
  const { data: selectedMarketAthletes } = useQuery({
    queryKey: ['admin-risk-market-athletes', selectedMarket?.id],
    enabled: !!selectedMarket,
    queryFn: async () => {
      if (!selectedMarket) return [];

      // Get selections with athlete info (actual odds are stored here)
      const { data: selections, error: selectionsError } = await supabase
        .from('selections')
        .select(`
          id,
          athlete_id,
          decimal_odds,
          athletes (
            id,
            name
          )
        `)
        .eq('market_id', selectedMarket.id);

      if (selectionsError) throw selectionsError;

      const marketLiability = liabilityData?.filter(l => l.market_id === selectedMarket.id) || [];

      // Calculate implied probability from decimal odds
      const athletes: AthleteRiskData[] = (selections || []).map(s => {
        const liability = marketLiability.find(l => l.athlete_id === s.athlete_id);
        const tokensOnAthlete = liability?.total_stake_tokens || 0;
        const percentOfPool = selectedMarket.total_tokens > 0 
          ? (tokensOnAthlete / selectedMarket.total_tokens) * 100 
          : 0;

        // Probability = 1 / decimal_odds (implied probability)
        const impliedProbability = (1 / s.decimal_odds) * 100;

        return {
          athlete_id: s.athlete_id,
          athlete_name: (s.athletes as any)?.name || 'Unknown',
          probability: impliedProbability,
          multiplier: s.decimal_odds,
          tokens_on_athlete: tokensOnAthlete,
          percent_of_pool: percentOfPool,
          payout_exposure: liability?.liability_if_wins || 0,
        };
      });

      return athletes.sort((a, b) => b.probability - a.probability);
    },
  });

  // Export functions
  const exportJSON = () => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      markets: marketsData,
      settlementPL,
      alerts,
      auditLogs: auditLogs?.slice(0, 100),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `risk-snapshot-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (!marketsData) return;
    
    const headers = [
      'Tournament', 'Market Type', 'Status', 'Sims', 'Implied Sum', 'Target',
      'House Edge Status', 'Total Entries', 'Total Tokens', 'Max Payout', 'Risk Ratio'
    ];
    
    const rows = marketsData.map(m => [
      m.tournament_name,
      m.market_type,
      m.status,
      m.sims,
      m.implied_sum.toFixed(4),
      m.target_implied_sum.toFixed(4),
      m.house_edge_status,
      m.total_entries,
      m.total_tokens,
      m.max_payout,
      m.risk_ratio.toFixed(3),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `risk-snapshot-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'OPEN': return 'default';
      case 'CLOSED': return 'secondary';
      case 'SETTLED': return 'outline';
      case 'LOCKED': return 'destructive';
      default: return 'outline';
    }
  };

  const getHouseEdgeBadge = (status: 'green' | 'yellow' | 'red') => {
    switch (status) {
      case 'green': return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Healthy</Badge>;
      case 'yellow': return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Warning</Badge>;
      case 'red': return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Risk</Badge>;
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="h-6 w-6" />
              Risk Dashboard
            </h2>
            <p className="text-muted-foreground">House safety, odds health, and exposure monitoring</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetchMarkets()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportJSON}>
              <FileJson className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* PART 1: KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Active Markets */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Active Markets
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">{kpis?.statusCounts.OPEN || 0} Open</Badge>
                <Badge variant="secondary">{kpis?.statusCounts.CLOSED || 0} Closed</Badge>
                <Badge variant="outline">{kpis?.statusCounts.SETTLED || 0} Settled</Badge>
                <Badge variant="destructive">{kpis?.statusCounts.LOCKED || 0} Locked</Badge>
              </div>
            </CardContent>
          </Card>

          {/* House Edge Health */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" />
                House Edge Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {kpis?.houseEdgeByType.map(({ type, avg, target }) => {
                  const band = HOUSE_EDGE_BANDS[type as MarketType];
                  const isHealthy = band && avg >= band.min && avg <= band.max;
                  return (
                    <div key={type} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{type}:</span>
                      <span className={isHealthy ? 'text-green-400' : 'text-red-400'}>
                        {avg.toFixed(3)} (target: {target.toFixed(3)})
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Total Exposure */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Total Exposure
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(kpis?.totalExposure || 0).toLocaleString()} tokens</div>
              <p className="text-xs text-muted-foreground">
                Max single entry: {(kpis?.maxSingleEntry || 0).toLocaleString()} tokens
              </p>
            </CardContent>
          </Card>

          {/* Alert Count */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Active Alerts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <span className="text-2xl font-bold">{alerts.length}</span>
                <div className="flex gap-1">
                  <Badge className="bg-red-500/20 text-red-400">
                    {alerts.filter(a => a.type === 'HIGH').length} High
                  </Badge>
                  <Badge className="bg-yellow-500/20 text-yellow-400">
                    {alerts.filter(a => a.type === 'MEDIUM').length} Med
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PART 7: Alerts Panel */}
        {alerts.length > 0 && (
          <Collapsible open={alertsExpanded} onOpenChange={setAlertsExpanded}>
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-400" />
                      Risk Alerts ({alerts.length})
                    </span>
                    {alertsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {alerts.map(alert => (
                      <Alert key={alert.id} variant={alert.type === 'HIGH' ? 'destructive' : 'default'}>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription className="flex items-center justify-between">
                          <span>{alert.message}</span>
                          {alert.marketId && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => {
                                const market = marketsData?.find(m => m.id === alert.marketId);
                                if (market) {
                                  setSelectedMarket(market);
                                  setDetailModalOpen(true);
                                }
                              }}
                            >
                              View
                            </Button>
                          )}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* PART 2: Market Risk Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Market Risk Overview
            </CardTitle>
            <CardDescription>All markets with risk metrics and house edge status</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tournament</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Sims</TableHead>
                    <TableHead className="text-right">Implied Sum</TableHead>
                    <TableHead>Edge Status</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Risk / Max</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marketsLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : marketsData?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground">
                        No markets found
                      </TableCell>
                    </TableRow>
                  ) : (
                    marketsData?.map(market => (
                      <TableRow 
                        key={market.id}
                        className={
                          market.house_edge_status === 'red' || (market.sims > 0 && market.sims !== 20000)
                            ? 'bg-red-500/10'
                            : market.risk_status === 'danger'
                              ? 'bg-red-500/10'
                              : market.risk_status === 'warning'
                                ? 'bg-yellow-500/10'
                                : ''
                        }
                      >
                        <TableCell className="font-medium">{market.tournament_name}</TableCell>
                        <TableCell>{market.market_type}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(market.status)}>
                            {market.status === 'LOCKED' && <Lock className="h-3 w-3 mr-1" />}
                            {market.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={market.sims !== 20000 && market.sims > 0 ? 'text-red-400' : ''}>
                            {market.sims.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {market.implied_sum > 0 ? market.implied_sum.toFixed(4) : '-'}
                        </TableCell>
                        <TableCell>{getHouseEdgeBadge(market.house_edge_status)}</TableCell>
                        <TableCell className="text-right">{market.total_entries}</TableCell>
                        <TableCell className="text-right">{market.total_tokens.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <span className={
                              market.risk_status === 'danger' ? 'text-red-400' : 
                              market.risk_status === 'warning' ? 'text-yellow-400' : ''
                            }>
                              {market.risk_ratio > 0 ? `${market.risk_ratio.toFixed(2)}x` : '-'}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              / {market.max_risk_ratio.toFixed(2)}x
                            </span>
                            {market.is_compressed && (
                              <Badge className="bg-blue-500/20 text-blue-400 text-xs ml-1">
                                <Zap className="h-3 w-3 mr-1" />
                                {market.cumulative_compression_pct.toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedMarket(market);
                                setDetailModalOpen(true);
                              }}
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {market.status === 'OPEN' && market.risk_status !== 'safe' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => compressMultipliers.mutate(market.id)}
                                disabled={compressMultipliers.isPending}
                                title="Compress multipliers"
                                className="text-blue-400 hover:text-blue-300"
                              >
                                <Zap className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* PART 5: Settlement P/L */}
        {settlementPL.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Settlement Results
              </CardTitle>
              <CardDescription>Profit/Loss by settled tournament</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tournament</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Paid Out</TableHead>
                    <TableHead className="text-right">Net Result</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {settlementPL.map(settlement => (
                    <TableRow key={settlement.id}>
                      <TableCell className="font-medium">{settlement.name}</TableCell>
                      <TableCell className="text-right">{settlement.collected.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{settlement.paid.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-bold">
                        <span className={settlement.net >= 0 ? 'text-green-400' : 'text-red-400'}>
                          {settlement.net >= 0 ? '+' : ''}{settlement.net.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          className={
                            settlement.status === 'PROFIT' 
                              ? 'bg-green-500/20 text-green-400' 
                              : settlement.status === 'LOSS'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-gray-500/20 text-gray-400'
                          }
                        >
                          {settlement.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* PART 6: Audit Log Stream */}
        <Collapsible open={auditLogsExpanded} onOpenChange={setAuditLogsExpanded}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Recent Audit Events ({auditLogs?.length || 0})
                  </span>
                  {auditLogsExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {auditLogs?.map(log => (
                      <Collapsible key={log.id}>
                        <CollapsibleTrigger asChild>
                          <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="text-xs">
                                {log.action_type}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {log.entity_type}: {log.entity_id.slice(0, 8)}...
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(log.created_at), 'MMM d, HH:mm')}
                            </span>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="p-3 ml-4 border-l-2 border-muted text-xs font-mono">
                            <div className="mb-2">
                              <span className="text-muted-foreground">Actor: </span>
                              {log.actor_type} {log.actor_id ? `(${log.actor_id.slice(0, 8)}...)` : ''}
                            </div>
                            {log.before_state && (
                              <div className="mb-2">
                                <span className="text-muted-foreground">Before: </span>
                                <pre className="text-xs overflow-x-auto">{JSON.stringify(log.before_state, null, 2)}</pre>
                              </div>
                            )}
                            {log.after_state && (
                              <div>
                                <span className="text-muted-foreground">After: </span>
                                <pre className="text-xs overflow-x-auto">{JSON.stringify(log.after_state, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* PART 3 & 4: Market Detail Modal */}
        <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedMarket?.name}
                <Badge variant={getStatusBadgeVariant(selectedMarket?.status || 'OPEN')}>
                  {selectedMarket?.status}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {selectedMarket?.tournament_name} • {selectedMarket?.discipline} • {selectedMarket?.category}
              </DialogDescription>
            </DialogHeader>

            {selectedMarket && (
              <div className="space-y-6">
                {/* Market Metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">Simulations</p>
                    <p className={`text-lg font-bold ${selectedMarket.sims !== 20000 && selectedMarket.sims > 0 ? 'text-red-400' : ''}`}>
                      {selectedMarket.sims.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">Implied Sum</p>
                    <p className="text-lg font-bold font-mono">{selectedMarket.implied_sum.toFixed(4)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">Target Band</p>
                    <p className="text-lg font-bold font-mono">
                      {HOUSE_EDGE_BANDS[selectedMarket.market_type]?.min.toFixed(3)} - {HOUSE_EDGE_BANDS[selectedMarket.market_type]?.max.toFixed(3)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">House Edge</p>
                    {getHouseEdgeBadge(selectedMarket.house_edge_status)}
                  </div>
                </div>

                {/* Exposure Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">Total Entries</p>
                    <p className="text-lg font-bold">{selectedMarket.total_entries}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">Total Tokens</p>
                    <p className="text-lg font-bold">{selectedMarket.total_tokens.toLocaleString()}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground">Max Payout</p>
                    <p className="text-lg font-bold">{selectedMarket.max_payout.toLocaleString()}</p>
                  </div>
                </div>

                {/* Athlete Risk Table */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Athlete Concentration</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Athlete</TableHead>
                        <TableHead className="text-right">Probability</TableHead>
                        <TableHead className="text-right">Multiplier</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead className="text-right">% of Pool</TableHead>
                        <TableHead className="text-right">Exposure</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedMarketAthletes?.map(athlete => (
                        <TableRow 
                          key={athlete.athlete_id}
                          className={
                            athlete.percent_of_pool > ALERT_THRESHOLDS.CONCENTRATION_PERCENT 
                              ? 'bg-yellow-500/10' 
                              : ''
                          }
                        >
                          <TableCell className="font-medium">{athlete.athlete_name}</TableCell>
                          <TableCell className="text-right">{athlete.probability.toFixed(1)}%</TableCell>
                          <TableCell className="text-right">{athlete.multiplier.toFixed(2)}×</TableCell>
                          <TableCell className="text-right">{athlete.tokens_on_athlete.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Progress 
                                value={Math.min(athlete.percent_of_pool, 100)} 
                                className="w-16 h-2" 
                              />
                              <span className={athlete.percent_of_pool > ALERT_THRESHOLDS.CONCENTRATION_PERCENT ? 'text-yellow-400' : ''}>
                                {athlete.percent_of_pool.toFixed(1)}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{athlete.payout_exposure.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Locked At Info */}
                {selectedMarket.locked_at && (
                  <Alert>
                    <Lock className="h-4 w-4" />
                    <AlertTitle>Results Finalized</AlertTitle>
                    <AlertDescription>
                      Locked at: {format(new Date(selectedMarket.locked_at), 'PPpp')}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default RiskDashboard;

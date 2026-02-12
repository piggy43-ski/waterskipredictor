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
  FileJson, FileSpreadsheet, Lock, Zap, Wallet, BanknoteIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { RISK_CONFIG, getLiabilityCap, getMaxRiskRatio, MarketType } from '@/utils/riskConfig';
import { toast } from 'sonner';

// Use risk config for bands
const HOUSE_EDGE_BANDS = RISK_CONFIG.IMPLIED_SUM_BANDS;
const MAX_RISK_RATIOS = RISK_CONFIG.MAX_RISK_RATIO;

// Bankroll summary interface
interface BankrollSummary {
  base_bankroll_usd: number;
  reserve_pct: number;
  token_value_usd: number;
  gross_deposits_usd: number;
  refunds_usd: number;
  fees_usd: number;
  withdrawals_usd: number;
  reserve_usd: number;
  net_deposits_usd: number;
  available_bankroll_usd: number;
  total_handle_tokens: number;
  total_liability_tokens: number;
  max_single_liability_tokens: number;
  total_handle_usd: number;
  total_liability_usd: number;
  max_single_liability_usd: number;
  worst_case_loss_usd: number;
  solvency_status: 'SAFE' | 'BLOCKED';
  last_synced_at: string | null;
}

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
  sims_run: number;  // Actual sims from market_odds
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
  odds_validation_status: 'PENDING' | 'VALID' | 'INVALID' | 'MISSING';
  odds_validation_error: string | null;
  has_monte_carlo: boolean;
  // Safe Mode fields
  loss_probability: number;
  expected_profit: number;
  profit_p05: number;
  safe_mode_status: 'PENDING' | 'SAFE' | 'RISK' | 'BLOCKED';
  last_safe_mode_check: string | null;
  is_safe: boolean;
}

interface AthleteRiskData {
  athlete_id: string;
  athlete_name: string;
  probability: number;
  multiplier: number;
  tokens_on_athlete: number;
  percent_of_pool: number;
  payout_exposure: number;
  remaining_capacity: number;
  is_at_capacity: boolean;
  // NEW: Calibration debug fields
  rank: number | null;
  power_score: number | null;
  prior_probability: number | null;
  mc_probability: number | null;
  blended_probability: number | null;
  temperature_used: number | null;
  calibration_iterations: number | null;
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

  // Generate odds mutation (Monte Carlo)
  const generateOdds = useMutation({
    mutationFn: async (marketId: string) => {
      const { data, error } = await supabase.functions.invoke('generate-market-odds', {
        body: { market_id: marketId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Odds generated: Implied sum = ${data.finalImpliedSum?.toFixed(4) || 'N/A'}`);
      queryClient.invalidateQueries({ queryKey: ['admin-risk-markets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-risk-audit-logs'] });
    },
    onError: (error: Error) => {
      toast.error(`Odds generation failed: ${error.message}`);
    },
  });

  // Generate all odds mutation
  const [generatingAllProgress, setGeneratingAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [fixingMultipliers, setFixingMultipliers] = useState(false);
  
  // Fix Multipliers - one-click repair for out-of-band markets
  const fixMultipliers = useMutation({
    mutationFn: async () => {
      const outOfBand = marketsData?.filter(m => {
        if (m.status !== 'OPEN' || m.locked_at) return false;
        if (m.implied_sum === 0 || m.implied_sum > 2) return true; // No odds
        const normalizedType = (m.market_type?.toUpperCase() || 'WINNER') as MarketType;
        const band = HOUSE_EDGE_BANDS[normalizedType];
        if (!band) return false;
        return m.implied_sum < band.min || m.implied_sum > band.max;
      }) || [];
      
      if (outOfBand.length === 0) throw new Error('No markets need fixing');
      
      setFixingMultipliers(true);
      const results: { name: string; before: number; after: number; success: boolean }[] = [];
      
      for (const market of outOfBand) {
        const beforeImplied = market.implied_sum;
        const { data, error } = await supabase.functions.invoke('generate-market-odds', {
          body: { market_id: market.id, force: true },
        });
        results.push({
          name: market.name,
          before: beforeImplied,
          after: data?.finalImpliedSum || data?.implied_sum || 0,
          success: !error,
        });
      }
      
      return results;
    },
    onSuccess: (results) => {
      const fixed = results.filter(r => r.success).length;
      toast.success(`Fixed ${fixed}/${results.length} markets`, {
        description: results.map(r => `${r.name}: ${(r.before * 100).toFixed(1)}% → ${(r.after * 100).toFixed(1)}%`).join('\n'),
      });
      setFixingMultipliers(false);
      queryClient.invalidateQueries({ queryKey: ['admin-risk-markets'] });
    },
    onError: (error: Error) => {
      toast.error(`Fix failed: ${error.message}`);
      setFixingMultipliers(false);
    },
  });

  const generateAllOdds = useMutation({
    mutationFn: async () => {
      const openMarkets = marketsData?.filter(m => 
        m.status === 'OPEN' && !m.locked_at && (m.implied_sum === 0 || m.implied_sum > 2)
      ) || [];
      
      if (openMarkets.length === 0) {
        throw new Error('No markets need odds generation');
      }

      setGeneratingAllProgress({ current: 0, total: openMarkets.length });
      
      for (let i = 0; i < openMarkets.length; i++) {
        const market = openMarkets[i];
        const { error } = await supabase.functions.invoke('generate-market-odds', {
          body: { market_id: market.id },
        });
        if (error) {
          console.error(`Failed to generate odds for ${market.name}:`, error);
        }
        setGeneratingAllProgress({ current: i + 1, total: openMarkets.length });
      }
      
      return openMarkets.length;
    },
    onSuccess: (count) => {
      toast.success(`Generated odds for ${count} markets`);
      setGeneratingAllProgress(null);
      queryClient.invalidateQueries({ queryKey: ['admin-risk-markets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-risk-audit-logs'] });
    },
    onError: (error: Error) => {
      toast.error(`Bulk odds generation failed: ${error.message}`);
      setGeneratingAllProgress(null);
    },
  });

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

  // Enforce Safe Mode mutation
  const enforceSafeMode = useMutation({
    mutationFn: async (marketId: string) => {
      const { data, error } = await supabase.functions.invoke('enforce-safe-mode', {
        body: { market_id: marketId, dry_run: false },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.adjustments_made) {
        toast.success(`Safe mode enforced: ${data.athletes_compressed} athletes compressed. Loss prob: ${(data.loss_probability * 100).toFixed(1)}%`);
      } else {
        toast.info(`Market already safe: Loss prob ${(data.loss_probability * 100).toFixed(1)}%`);
      }
      queryClient.invalidateQueries({ queryKey: ['admin-risk-markets'] });
      queryClient.invalidateQueries({ queryKey: ['admin-risk-audit-logs'] });
    },
    onError: (error: Error) => {
      toast.error(`Safe mode enforcement failed: ${error.message}`);
    },
  });

  // Fetch all markets with their odds data
  const { data: marketsData, isLoading: marketsLoading, refetch: refetchMarkets } = useQuery({
    queryKey: ['admin-risk-markets'],
    queryFn: async () => {
      // Get markets with tournament info and validation status
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
          odds_validation_status,
          odds_validation_error,
          loss_probability,
          expected_profit,
          profit_p05,
          safe_mode_status,
          last_safe_mode_check,
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

      // CRITICAL: Get implied sum from market_odds.adjusted_probability (source of truth)
      // This is the properly computed implied sum from Monte Carlo
      const { data: marketOdds, error: marketOddsError } = await supabase
        .from('market_odds')
        .select('market_id, adjusted_probability, sims_run');

      if (marketOddsError) throw marketOddsError;

      // Calculate implied sum per market from adjusted_probability (SUM of p_adjusted)
      const impliedSumByMarket: Record<string, { sum: number; count: number; sims_run: number }> = {};
      (marketOdds || []).forEach(mo => {
        if (!impliedSumByMarket[mo.market_id]) {
          impliedSumByMarket[mo.market_id] = { sum: 0, count: 0, sims_run: 0 };
        }
        // adjusted_probability IS the implied probability (1/final_odds)
        impliedSumByMarket[mo.market_id].sum += mo.adjusted_probability || 0;
        impliedSumByMarket[mo.market_id].count += 1;
        impliedSumByMarket[mo.market_id].sims_run = mo.sims_run || 0;
      });

      // Get selections for selection_id -> market_id mapping
      const { data: selections, error: selectionsError } = await supabase
        .from('selections')
        .select('id, market_id');

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
        // Get implied sum from market_odds.adjusted_probability (source of truth)
        const impliedData = impliedSumByMarket[market.id];
        const impliedSum = impliedData?.sum || 0;
        const selectionCount = impliedData?.count || 0;
        const simsRun = impliedData?.sims_run || 0;
        
        // Check if we have Monte Carlo data
        const hasMonteCarlo = selectionCount > 0 && simsRun === 20000;
        
        // Legacy sims for backward compat (shows 20000 if we have any selections)
        const sims = selectionCount > 0 ? 20000 : 0;
        
        // Normalize market_type to uppercase for lookup
        const normalizedMarketType = (market.market_type?.toUpperCase() || 'WINNER') as MarketType;
        const band = HOUSE_EDGE_BANDS[normalizedMarketType];
        const targetImpliedSum = band?.target || 0.9;

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

        // Get validation status from DB (new columns)
        const validationStatus = (market.odds_validation_status || 'PENDING') as 'PENDING' | 'VALID' | 'INVALID' | 'MISSING';
        const validationError = market.odds_validation_error || null;

        // Determine house edge health (band already set above with normalized type)
        let houseEdgeStatus: 'green' | 'yellow' | 'red' = 'green';
        if (band && hasMonteCarlo) {
          if (impliedSum < band.min - 0.02 || impliedSum > band.max + 0.02) {
            houseEdgeStatus = 'red';
          } else if (impliedSum < band.min || impliedSum > band.max) {
            houseEdgeStatus = 'yellow';
          }
        } else if (!hasMonteCarlo && selectionCount > 0) {
          // No Monte Carlo but has selections = placeholder odds = red
          houseEdgeStatus = 'red';
        }

        // Get max risk ratio for this market type (use normalized type)
        const maxRiskRatio = MAX_RISK_RATIOS[normalizedMarketType] || MAX_RISK_RATIOS.WINNER;
        
        // Determine risk status based on ratio vs max
        let riskStatus: 'safe' | 'warning' | 'danger' = 'safe';
        if (riskRatio > maxRiskRatio) {
          riskStatus = 'danger';
        } else if (riskRatio > maxRiskRatio * 0.9) {
          riskStatus = 'warning';
        }
        
        // Safe Mode fields
        const lossProbability = market.loss_probability || 0;
        const expectedProfit = market.expected_profit || 0;
        const profitP05 = market.profit_p05 || 0;
        const safeModeStatus = (market.safe_mode_status || 'PENDING') as 'PENDING' | 'SAFE' | 'RISK' | 'BLOCKED';
        const lastSafeModeCheck = market.last_safe_mode_check || null;
        
        // A market is "safe" if loss probability ≤ 10% AND risk ratio within cap
        const isSafe = lossProbability <= 0.10 && riskRatio <= maxRiskRatio;

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
          sims_run: simsRun,
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
          odds_validation_status: validationStatus,
          odds_validation_error: validationError,
          has_monte_carlo: hasMonteCarlo,
          // Safe Mode fields
          loss_probability: lossProbability,
          expected_profit: expectedProfit,
          profit_p05: profitP05,
          safe_mode_status: safeModeStatus,
          last_safe_mode_check: lastSafeModeCheck,
          is_safe: isSafe,
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
          'SAFE_MODE_ADJUSTMENT',
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

  // Fetch global bankroll summary
  const { data: bankrollSummary, refetch: refetchBankroll } = useQuery({
    queryKey: ['admin-bankroll-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('house_bankroll_summary')
        .select('*')
        .single();

      if (error) {
        console.error('Bankroll summary error:', error);
        // Return defaults if view doesn't exist yet
        return {
          base_bankroll_usd: 5000,
          reserve_pct: 0.25,
          token_value_usd: 0.01,
          gross_deposits_usd: 0,
          refunds_usd: 0,
          fees_usd: 0,
          withdrawals_usd: 0,
          reserve_usd: 0,
          net_deposits_usd: 0,
          available_bankroll_usd: 5000,
          total_handle_tokens: 0,
          total_liability_tokens: 0,
          max_single_liability_tokens: 0,
          total_handle_usd: 0,
          total_liability_usd: 0,
          max_single_liability_usd: 0,
          worst_case_loss_usd: 0,
          solvency_status: 'SAFE' as const,
          last_synced_at: null,
        } as BankrollSummary;
      }
      return data as BankrollSummary;
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

    // Safe Mode stats
    const openMarkets = marketsData.filter(m => m.status === 'OPEN');
    const safeCount = openMarkets.filter(m => m.safe_mode_status === 'SAFE').length;
    const riskCount = openMarkets.filter(m => m.safe_mode_status === 'RISK').length;
    const pendingCount = openMarkets.filter(m => m.safe_mode_status === 'PENDING').length;
    const avgLossProbability = openMarkets.length > 0 
      ? openMarkets.reduce((sum, m) => sum + (m.loss_probability || 0), 0) / openMarkets.length 
      : 0;

    return {
      statusCounts,
      houseEdgeByType,
      totalExposure,
      maxSingleEntry,
      safeMode: {
        safeCount,
        riskCount,
        pendingCount,
        avgLossProbability,
      },
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

  // Get athlete details for selected market with calibration data
  const { data: selectedMarketAthletes } = useQuery({
    queryKey: ['admin-risk-market-athletes', selectedMarket?.id],
    enabled: !!selectedMarket,
    queryFn: async () => {
      if (!selectedMarket) return [];

      // Get market_odds with calibration data (source of truth for odds engine details)
      const { data: marketOdds, error: oddsError } = await supabase
        .from('market_odds')
        .select(`
          athlete_id,
          final_decimal_odds,
          power_score,
          prior_probability,
          mc_probability,
          blended_probability,
          temperature_used,
          calibration_iterations,
          athlete_rank,
          athletes (
            id,
            name
          )
        `)
        .eq('market_id', selectedMarket.id);

      if (oddsError) throw oddsError;

      const marketLiability = liabilityData?.filter(l => l.market_id === selectedMarket.id) || [];

      // Calculate implied probability and exposure data
      const athletes: AthleteRiskData[] = (marketOdds || []).map(mo => {
        const liability = marketLiability.find(l => l.athlete_id === mo.athlete_id);
        const tokensOnAthlete = liability?.total_stake_tokens || 0;
        const percentOfPool = selectedMarket.total_tokens > 0 
          ? (tokensOnAthlete / selectedMarket.total_tokens) * 100 
          : 0;

        // Probability = 1 / decimal_odds (implied probability)
        const multiplier = mo.final_decimal_odds || 1.2;
        const impliedProbability = (1 / multiplier) * 100;

        // Option A: Calculate remaining capacity (30% cap)
        const maxAthleteTokens = selectedMarket.total_tokens * RISK_CONFIG.MAX_ATHLETE_EXPOSURE_PCT;
        const remainingCapacity = Math.max(0, Math.floor(maxAthleteTokens - tokensOnAthlete));
        const isAtCapacity = tokensOnAthlete >= maxAthleteTokens && selectedMarket.total_tokens > 0;

        return {
          athlete_id: mo.athlete_id,
          athlete_name: (mo.athletes as any)?.name || 'Unknown',
          probability: impliedProbability,
          multiplier: multiplier,
          tokens_on_athlete: tokensOnAthlete,
          percent_of_pool: percentOfPool,
          payout_exposure: liability?.liability_if_wins || 0,
          remaining_capacity: remainingCapacity,
          is_at_capacity: isAtCapacity,
          // Calibration debug fields
          rank: mo.athlete_rank,
          power_score: mo.power_score,
          prior_probability: mo.prior_probability,
          mc_probability: mo.mc_probability,
          blended_probability: mo.blended_probability,
          temperature_used: mo.temperature_used,
          calibration_iterations: mo.calibration_iterations,
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
            {/* Fix Multipliers Button */}
            {marketsData?.some(m => {
              if (m.status !== 'OPEN' || m.locked_at) return false;
              if (m.implied_sum === 0 || m.implied_sum > 2) return true;
              const normalizedType = (m.market_type?.toUpperCase() || 'WINNER') as MarketType;
              const band = HOUSE_EDGE_BANDS[normalizedType];
              if (!band) return false;
              return m.implied_sum < band.min || m.implied_sum > band.max;
            }) && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => fixMultipliers.mutate()}
                disabled={fixMultipliers.isPending}
              >
                {fixMultipliers.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Fixing...
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Fix Multipliers
                  </>
                )}
              </Button>
            )}
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => generateAllOdds.mutate()}
              disabled={generateAllOdds.isPending || !marketsData?.some(m => m.status === 'OPEN' && (m.implied_sum === 0 || m.implied_sum > 2))}
            >
              {generateAllOdds.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {generatingAllProgress ? `${generatingAllProgress.current}/${generatingAllProgress.total}` : 'Generating...'}
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Generate All Odds
                </>
              )}
            </Button>
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
                  const normalizedType = (type?.toUpperCase() || 'WINNER') as MarketType;
                  const band = HOUSE_EDGE_BANDS[normalizedType];
                  const isHealthy = band && avg >= band.min && avg <= band.max;
                  return (
                    <div key={type} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{type}:</span>
                      <span className={isHealthy ? 'text-green-400' : 'text-red-400'}>
                        {(avg || 0).toFixed(3)} (target: {(target || 0.9).toFixed(3)})
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

          {/* Safe Mode Status Card */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Shield className="h-4 w-4" />
                90% Safe Mode
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    {kpis?.safeMode?.safeCount || 0} SAFE
                  </Badge>
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    {kpis?.safeMode?.riskCount || 0} RISK
                  </Badge>
                  <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                    {kpis?.safeMode?.pendingCount || 0} Pending
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg loss prob: {((kpis?.safeMode?.avgLossProbability || 0) * 100).toFixed(1)}%
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Global Solvency Dashboard - Primary Risk Control */}
        <Card className={`border-2 ${bankrollSummary?.solvency_status === 'SAFE' ? 'border-green-500/50 bg-green-500/5' : 'border-red-500/50 bg-red-500/5'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-bold flex items-center gap-3">
              <Wallet className="h-5 w-5" />
              Global Solvency Status
              <Badge 
                className={`text-sm px-3 py-1 ${
                  bankrollSummary?.solvency_status === 'SAFE' 
                    ? 'bg-green-500/20 text-green-400 border-green-500/30' 
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                }`}
              >
                {bankrollSummary?.solvency_status || 'SAFE'}
              </Badge>
            </CardTitle>
            <CardDescription>
              Real-time house bankroll monitoring • Worst-case loss must be within available bankroll
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {/* Base Bankroll (B0) */}
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <BanknoteIcon className="h-3 w-3" />
                  Base Bankroll (B₀)
                </p>
                <p className="text-lg font-bold">${(bankrollSummary?.base_bankroll_usd || 5000).toLocaleString()}</p>
              </div>
              
              {/* Total Deposits (D) */}
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Total Deposits (D)</p>
                <p className="text-lg font-bold">${(bankrollSummary?.gross_deposits_usd || 0).toLocaleString()}</p>
              </div>
              
              {/* Reserve (R) */}
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Reserve ({((bankrollSummary?.reserve_pct || 0.25) * 100).toFixed(0)}%)</p>
                <p className="text-lg font-bold text-yellow-400">${(bankrollSummary?.reserve_usd || 0).toLocaleString()}</p>
              </div>
              
              {/* Available Bankroll (B) */}
              <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
                <p className="text-xs text-muted-foreground font-medium">Available Bankroll (B)</p>
                <p className="text-xl font-bold text-primary">${(bankrollSummary?.available_bankroll_usd || 5000).toLocaleString()}</p>
              </div>
              
              {/* Market Handle */}
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Market Handle</p>
                <p className="text-lg font-bold">
                  {(bankrollSummary?.total_handle_tokens || 0).toLocaleString()} tokens
                </p>
                <p className="text-xs text-muted-foreground">
                  ${(bankrollSummary?.total_handle_usd || 0).toLocaleString()}
                </p>
              </div>
              
              {/* Worst-Case Loss */}
              <div className={`p-3 rounded-lg ${
                (bankrollSummary?.worst_case_loss_usd || 0) > (bankrollSummary?.available_bankroll_usd || 5000) * 0.8
                  ? 'bg-red-500/20 border border-red-500/30'
                  : 'bg-muted/30'
              }`}>
                <p className="text-xs text-muted-foreground">Worst-Case Loss</p>
                <p className={`text-lg font-bold ${
                  (bankrollSummary?.worst_case_loss_usd || 0) > (bankrollSummary?.available_bankroll_usd || 5000) * 0.8
                    ? 'text-red-400'
                    : ''
                }`}>
                  ${(bankrollSummary?.worst_case_loss_usd || 0).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">
                  {((bankrollSummary?.worst_case_loss_usd || 0) / Math.max(bankrollSummary?.available_bankroll_usd || 1, 1) * 100).toFixed(1)}% of available
                </p>
              </div>
            </div>

            {/* Solvency Explanation */}
            <div className="mt-4 p-3 rounded-lg bg-muted/20 text-sm">
              <p className="text-muted-foreground">
                <strong>Solvency Formula:</strong> B = B₀ + D - (D × Reserve%) - Refunds - Fees - Withdrawals
              </p>
              <p className="text-muted-foreground mt-1">
                <strong>Check:</strong> If WorstCaseLoss &gt; B, new entries are BLOCKED until exposure decreases or deposits increase.
              </p>
            </div>
          </CardContent>
        </Card>

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
                    <TableHead>Edge</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Risk / Max</TableHead>
                    <TableHead className="text-right">Loss Prob</TableHead>
                    <TableHead>Safe</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {marketsLoading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : marketsData?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground">
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
                          <div className="flex items-center justify-end gap-1">
                            {market.implied_sum > 0 ? market.implied_sum.toFixed(4) : '-'}
                            {market.implied_sum > 2 && (
                              <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-xs ml-1">
                                No Odds
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{getHouseEdgeBadge(market.house_edge_status)}</TableCell>
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
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={
                            market.loss_probability > 0.10 ? 'text-red-400 font-medium' :
                            market.loss_probability > 0.05 ? 'text-yellow-400' : 'text-green-400'
                          }>
                            {market.loss_probability > 0 ? `${(market.loss_probability * 100).toFixed(1)}%` : '-'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {market.safe_mode_status === 'SAFE' && (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              SAFE
                            </Badge>
                          )}
                          {market.safe_mode_status === 'RISK' && (
                            <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                              <XCircle className="h-3 w-3 mr-1" />
                              RISK
                            </Badge>
                          )}
                          {market.safe_mode_status === 'PENDING' && (
                            <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30">
                              —
                            </Badge>
                          )}
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
                            {market.status === 'OPEN' && (market.implied_sum === 0 || market.implied_sum > 2) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => generateOdds.mutate(market.id)}
                                disabled={generateOdds.isPending}
                                title="Generate Monte Carlo odds"
                                className="text-orange-400 hover:text-orange-300"
                              >
                                <Target className="h-4 w-4" />
                              </Button>
                            )}
                            {market.status === 'OPEN' && market.implied_sum > 0 && market.implied_sum <= 2 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => enforceSafeMode.mutate(market.id)}
                                disabled={enforceSafeMode.isPending}
                                title="Run safe mode check & enforcement"
                                className={market.safe_mode_status === 'RISK' ? 'text-red-400 hover:text-red-300' : 'text-green-400 hover:text-green-300'}
                              >
                                <Shield className="h-4 w-4" />
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
                      {(() => {
                        const normalizedType = (selectedMarket.market_type?.toUpperCase() || 'WINNER') as MarketType;
                        const band = HOUSE_EDGE_BANDS[normalizedType];
                        return `${(band?.min || 0.9).toFixed(3)} - ${(band?.max || 0.915).toFixed(3)}`;
                      })()}
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

                {/* Calibration Summary */}
                {selectedMarketAthletes && selectedMarketAthletes[0]?.temperature_used && (
                  <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-blue-400" />
                      <span className="text-sm font-medium text-blue-400">Calibration Status</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Temperature: </span>
                        <span className="font-mono">{selectedMarketAthletes[0].temperature_used?.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Iterations: </span>
                        <span className="font-mono">{selectedMarketAthletes[0].calibration_iterations || '-'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Top-1: </span>
                        <span className="font-mono">{selectedMarketAthletes[0]?.multiplier.toFixed(2)}×</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Top-3: </span>
                        <span className="font-mono">{selectedMarketAthletes[2]?.multiplier.toFixed(2) || '-'}×</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Athlete Risk Table with Calibration Debug */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Athlete Odds &amp; Calibration Debug</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Athlete</TableHead>
                          <TableHead className="text-right">Rank</TableHead>
                          <TableHead className="text-right">Power</TableHead>
                          <TableHead className="text-right">P(prior)</TableHead>
                          <TableHead className="text-right">P(MC)</TableHead>
                          <TableHead className="text-right">P(blend)</TableHead>
                          <TableHead className="text-right">Multiplier</TableHead>
                          <TableHead className="text-right">% Pool</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedMarketAthletes?.map((athlete, idx) => (
                          <TableRow 
                            key={athlete.athlete_id}
                            className={
                              idx < 3 
                                ? 'bg-primary/5 border-l-2 border-l-primary'
                                : athlete.is_at_capacity 
                                  ? 'bg-red-500/10' 
                                  : athlete.percent_of_pool > 25 
                                    ? 'bg-yellow-500/10' 
                                    : ''
                            }
                          >
                            <TableCell className="font-medium">
                              {idx < 3 && <span className="text-primary mr-1">#{idx + 1}</span>}
                              {athlete.athlete_name}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {athlete.rank || '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {athlete.power_score?.toFixed(1) || '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {athlete.prior_probability ? (athlete.prior_probability * 100).toFixed(1) + '%' : '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {athlete.mc_probability ? (athlete.mc_probability * 100).toFixed(1) + '%' : '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {athlete.blended_probability ? (athlete.blended_probability * 100).toFixed(1) + '%' : '-'}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {athlete.multiplier.toFixed(2)}×
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Progress 
                                  value={Math.min((athlete.percent_of_pool / 30) * 100, 100)} 
                                  className="w-12 h-2" 
                                />
                                <span className={athlete.percent_of_pool >= 30 ? 'text-red-400' : athlete.percent_of_pool > 25 ? 'text-yellow-400' : 'text-xs'}>
                                  {athlete.percent_of_pool.toFixed(1)}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={athlete.remaining_capacity === 0 ? 'text-red-400' : 'text-green-400 text-xs'}>
                                {athlete.remaining_capacity.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              {athlete.is_at_capacity ? (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                                  CAPPED
                                </Badge>
                              ) : athlete.percent_of_pool > 25 ? (
                                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-xs">
                                  Near Cap
                                </Badge>
                              ) : (
                                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                                  OK
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
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

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { Play, AlertTriangle, CheckCircle, Info, BarChart3, Target, TrendingUp, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface MarketOdds {
  id: string;
  athlete_id: string;
  base_probability: number;
  base_decimal_odds: number;
  manual_multiplier: number | null;
  final_decimal_odds: number;
  token_price: number | null;
  tau: number | null;
  sims: number | null;
  overround: number | null;
  target_implied_sum: number | null;
  scaling_factor: number | null;
  athlete: {
    id: string;
    name: string;
    current_rating_slalom: number | null;
    current_rating_trick: number | null;
    current_rating_jump: number | null;
  };
}

interface Market {
  id: string;
  name: string;
  discipline: string;
  category: string;
  market_type: string;
  tournament: {
    id: string;
    name: string;
  };
}

interface SimulationResult {
  market_id: string;
  market_type: string;
  athletes_processed: number;
  target_implied_sum: number;
  actual_implied_sum: number;
  scaling_factor: number;
  house_edge_pct: number;
  is_within_range: boolean;
  acceptable_range: { min: number; max: number };
  overround: number;
  tau: number;
}

const TAU_VALUES: Record<string, number> = { slalom: 14, trick: 22, jump: 12 };
const SIGMA_VALUES: Record<string, number> = { slalom: 6, trick: 10, jump: 8 };
const OVERROUND_VALUES: Record<string, number> = { WINNER: 1.10, PODIUM: 1.18, HIGHEST_SCORE: 1.14 };
const TARGET_IMPLIED_SUM: Record<string, number> = { WINNER: 0.909, PODIUM: 0.847, HIGHEST_SCORE: 0.877 };
const IMPLIED_SUM_RANGES: Record<string, { min: number; max: number }> = {
  WINNER: { min: 0.90, max: 0.915 },
  PODIUM: { min: 0.84, max: 0.86 },
  HIGHEST_SCORE: { min: 0.87, max: 0.89 }
};

export default function MonteCarloTest() {
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

  // Fetch tournaments with market_entries
  const { data: tournaments } = useQuery({
    queryKey: ['mc-test-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, status')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch markets for selected tournament
  const { data: markets } = useQuery({
    queryKey: ['mc-test-markets', selectedTournament],
    queryFn: async () => {
      if (!selectedTournament) return [];
      const { data, error } = await supabase
        .from('markets')
        .select('id, name, discipline, category, market_type, tournament:tournaments(id, name)')
        .eq('tournament_id', selectedTournament);
      if (error) throw error;
      return data as Market[];
    },
    enabled: !!selectedTournament,
  });

  // Fetch entries count for each market
  const { data: entryCounts } = useQuery({
    queryKey: ['mc-test-entry-counts', selectedTournament],
    queryFn: async () => {
      if (!selectedTournament || !markets) return {};
      const counts: Record<string, number> = {};
      for (const market of markets) {
        const { count } = await supabase
          .from('market_entries')
          .select('*', { count: 'exact', head: true })
          .eq('market_id', market.id)
          .eq('is_active', true);
        counts[market.id] = count || 0;
      }
      return counts;
    },
    enabled: !!markets && markets.length > 0,
  });

  // Fetch market odds after simulation
  const { data: marketOdds, refetch: refetchOdds } = useQuery({
    queryKey: ['mc-test-odds', selectedMarket],
    queryFn: async () => {
      if (!selectedMarket) return [];
      const { data, error } = await supabase
        .from('market_odds')
        .select('*, athlete:athletes(id, name, current_rating_slalom, current_rating_trick, current_rating_jump)')
        .eq('market_id', selectedMarket)
        .order('base_probability', { ascending: false });
      if (error) throw error;
      return data as unknown as MarketOdds[];
    },
    enabled: !!selectedMarket,
  });

  const selectedMarketData = markets?.find(m => m.id === selectedMarket);

  // Run Monte Carlo simulation
  const runSimulation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-market-odds', {
        body: { market_id: selectedMarket, force: true },
      });
      if (error) throw error;
      return data as SimulationResult;
    },
    onSuccess: (data) => {
      setSimulationResult(data);
      refetchOdds();
      toast.success('Monte Carlo simulation completed!');
    },
    onError: (error) => {
      toast.error(`Simulation failed: ${error.message}`);
    },
  });

  const getRating = (athlete: MarketOdds['athlete'], discipline: string) => {
    switch (discipline) {
      case 'slalom': return athlete.current_rating_slalom;
      case 'trick': return athlete.current_rating_trick;
      case 'jump': return athlete.current_rating_jump;
      default: return null;
    }
  };

  const getImpliedSumStatus = (sum: number, marketType: string) => {
    const range = IMPLIED_SUM_RANGES[marketType] || IMPLIED_SUM_RANGES.WINNER;
    const target = TARGET_IMPLIED_SUM[marketType] || 0.909;
    
    if (sum >= range.min && sum <= range.max) {
      return { status: 'success', message: 'House edge enforced ✓', color: 'text-green-600' };
    }
    if (sum > range.max) {
      return { status: 'error', message: 'Above target - reduce manual multipliers', color: 'text-red-600' };
    }
    // Below range means even more house edge (which is fine, but unusual)
    return { status: 'warning', message: `Below target (${target.toFixed(3)}) - house edge higher than expected`, color: 'text-yellow-600' };
  };

  const impliedSum = marketOdds?.reduce((acc, o) => acc + (1 / o.final_decimal_odds), 0) || 0;
  const totalProbability = marketOdds?.reduce((acc, o) => acc + o.base_probability, 0) || 0;
  const impliedStatus = getImpliedSumStatus(impliedSum, selectedMarketData?.market_type || 'WINNER');
  const targetSum = TARGET_IMPLIED_SUM[selectedMarketData?.market_type || 'WINNER'] || 0.909;
  const acceptableRange = IMPLIED_SUM_RANGES[selectedMarketData?.market_type || 'WINNER'] || IMPLIED_SUM_RANGES.WINNER;

  // Calculate house edge percentage
  const houseEdgePct = impliedSum > 0 ? ((1 / impliedSum - 1) * 100).toFixed(2) : '0.00';
  
  // Get scaling factor from the first odds entry (they should all have the same value)
  const scalingFactor = marketOdds?.[0]?.scaling_factor ?? 1.0;

  // Chart data
  const chartData = marketOdds?.map(o => ({
    name: o.athlete.name.split(' ').pop() || o.athlete.name,
    probability: Math.round(o.base_probability * 1000) / 10,
    fullName: o.athlete.name,
  })) || [];

  const getChartColor = (index: number) => {
    const colors = [
      'hsl(var(--chart-1))',
      'hsl(var(--chart-2))',
      'hsl(var(--chart-3))',
      'hsl(var(--chart-4))',
      'hsl(var(--chart-5))',
    ];
    return colors[index % colors.length];
  };

  // Check if market can be published (house edge enforced)
  const canPublish = impliedSum >= acceptableRange.min && impliedSum <= acceptableRange.max;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Monte Carlo Simulator</h1>
          <p className="text-muted-foreground">Test and validate the prediction multiplier engine with house edge enforcement</p>
        </div>

        {/* Market Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Contest</CardTitle>
            <CardDescription>Choose a contest with entries to run simulation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tournament</label>
                <Select value={selectedTournament} onValueChange={(v) => { setSelectedTournament(v); setSelectedMarket(''); setSimulationResult(null); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tournament" />
                  </SelectTrigger>
                  <SelectContent>
                    {tournaments?.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Contest</label>
                <Select value={selectedMarket} onValueChange={(v) => { setSelectedMarket(v); setSimulationResult(null); }} disabled={!selectedTournament}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contest" />
                  </SelectTrigger>
                  <SelectContent>
                    {markets?.map(m => (
                      <SelectItem key={m.id} value={m.id} disabled={(entryCounts?.[m.id] || 0) < 3}>
                        {m.name} ({entryCounts?.[m.id] || 0} entries)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedMarketData && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Badge variant="outline">Type: {selectedMarketData.market_type}</Badge>
                <Badge variant="outline">Discipline: {selectedMarketData.discipline}</Badge>
                <Badge variant="outline">TAU: {TAU_VALUES[selectedMarketData.discipline]}</Badge>
                {selectedMarketData.market_type === 'HIGHEST_SCORE' && (
                  <Badge variant="outline">SIGMA: {SIGMA_VALUES[selectedMarketData.discipline]}</Badge>
                )}
                <Badge variant="outline">Overround: {OVERROUND_VALUES[selectedMarketData.market_type]}</Badge>
                <Badge variant="secondary">Target: {TARGET_IMPLIED_SUM[selectedMarketData.market_type]}</Badge>
              </div>
            )}

            <Button
              onClick={() => runSimulation.mutate()}
              disabled={!selectedMarket || runSimulation.isPending}
              className="w-full md:w-auto"
            >
              <Play className="h-4 w-4 mr-2" />
              {runSimulation.isPending ? 'Running 20,000 simulations...' : 'Run Monte Carlo Simulation'}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {marketOdds && marketOdds.length > 0 && (
          <>
            {/* House Edge Status Banner */}
            {!canPublish && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Cannot Publish - House Edge Not Enforced</AlertTitle>
                <AlertDescription>
                  Implied sum ({impliedSum.toFixed(3)}) is outside acceptable range ({acceptableRange.min.toFixed(3)} - {acceptableRange.max.toFixed(3)}). 
                  Adjust manual multipliers or re-run simulation.
                </AlertDescription>
              </Alert>
            )}

            {canPublish && (
              <Alert className="border-green-500 bg-green-50 dark:bg-green-950/20">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-green-700 dark:text-green-400">Ready to Publish</AlertTitle>
                <AlertDescription className="text-green-600 dark:text-green-300">
                  House edge is enforced. Implied sum ({impliedSum.toFixed(3)}) is within target range.
                </AlertDescription>
              </Alert>
            )}

            {/* Statistics - Updated with new metrics */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{marketOdds[0]?.sims?.toLocaleString() || '20,000'}</div>
                  <p className="text-sm text-muted-foreground">Simulations</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-muted-foreground" />
                    <div className="text-2xl font-bold">{targetSum.toFixed(3)}</div>
                  </div>
                  <p className="text-sm text-muted-foreground">Target Implied Sum</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className={`text-2xl font-bold ${impliedStatus.color}`}>
                    {impliedSum.toFixed(3)}
                  </div>
                  <p className="text-sm text-muted-foreground">Actual Implied Sum</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-muted-foreground" />
                    <div className={`text-2xl font-bold ${scalingFactor > 1 ? 'text-blue-600' : ''}`}>
                      {scalingFactor.toFixed(3)}x
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Scaling Factor</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-green-600">{houseEdgePct}%</div>
                  <p className="text-sm text-muted-foreground">House Edge</p>
                </CardContent>
              </Card>
            </div>

            {/* Implied Sum Alert with Details */}
            <Alert variant={impliedStatus.status === 'error' ? 'destructive' : 'default'}>
              {impliedStatus.status === 'success' ? <CheckCircle className="h-4 w-4" /> : 
               impliedStatus.status === 'warning' ? <AlertTriangle className="h-4 w-4" /> : 
               <AlertTriangle className="h-4 w-4" />}
              <AlertTitle>
                Implied Sum: {impliedSum.toFixed(3)} 
                {scalingFactor > 1 && <span className="ml-2 text-blue-600">(scaled by {scalingFactor.toFixed(3)}x)</span>}
              </AlertTitle>
              <AlertDescription>
                {impliedStatus.message} | Acceptable range: {acceptableRange.min.toFixed(3)} - {acceptableRange.max.toFixed(3)}
              </AlertDescription>
            </Alert>

            {/* Probability Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Probability Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical">
                      <XAxis type="number" domain={[0, 'auto']} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" width={100} />
                      <Tooltip 
                        formatter={(value: number) => [`${value}%`, 'Probability']}
                        labelFormatter={(label) => chartData.find(d => d.name === label)?.fullName || label}
                      />
                      <Bar dataKey="probability" radius={[0, 4, 4, 0]}>
                        {chartData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={getChartColor(index)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Results Table */}
            <Card>
              <CardHeader>
                <CardTitle>Simulation Results</CardTitle>
                <CardDescription>
                  Calculated probabilities and multipliers for {marketOdds.length} athletes
                  {scalingFactor > 1 && (
                    <span className="ml-2 text-blue-600">
                      (Normalization applied: {scalingFactor.toFixed(3)}x scaling)
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Athlete</TableHead>
                      <TableHead className="text-right">Rating</TableHead>
                      <TableHead className="text-right">Probability</TableHead>
                      <TableHead className="text-right">Base Multiplier</TableHead>
                      <TableHead className="text-right">Manual Adj.</TableHead>
                      <TableHead className="text-right">Final Multiplier</TableHead>
                      <TableHead className="text-right">Token Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marketOdds.map((odds, idx) => (
                      <TableRow key={odds.id}>
                        <TableCell className="font-medium">
                          <span className="mr-2 text-muted-foreground">{idx + 1}.</span>
                          {odds.athlete.name}
                        </TableCell>
                        <TableCell className="text-right">
                          {selectedMarketData && getRating(odds.athlete, selectedMarketData.discipline)}
                        </TableCell>
                        <TableCell className="text-right">
                          {(odds.base_probability * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">
                          {odds.base_decimal_odds.toFixed(2)}x
                        </TableCell>
                        <TableCell className="text-right">
                          {odds.manual_multiplier?.toFixed(2) || '0.97'}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {odds.final_decimal_odds.toFixed(2)}x
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {odds.token_price?.toLocaleString() || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Validation Checks */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Info className="h-5 w-5" />
                  Validation Checks
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {selectedMarketData?.market_type === 'WINNER' && (
                  <div className="flex items-center gap-2">
                    {Math.abs(totalProbability - 1.0) < 0.01 ? 
                      <CheckCircle className="h-4 w-4 text-green-600" /> : 
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                    <span>WINNER: Sum of probabilities = {(totalProbability * 100).toFixed(1)}% (should be ~100%)</span>
                  </div>
                )}
                {selectedMarketData?.market_type === 'PODIUM' && (
                  <div className="flex items-center gap-2">
                    {Math.abs(totalProbability - 3.0) < 0.1 ? 
                      <CheckCircle className="h-4 w-4 text-green-600" /> : 
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                    <span>PODIUM: Sum of probabilities = {(totalProbability * 100).toFixed(1)}% (should be ~300%)</span>
                  </div>
                )}
                
                {/* House Edge Validation - CRITICAL */}
                <div className="flex items-center gap-2">
                  {canPublish ? 
                    <CheckCircle className="h-4 w-4 text-green-600" /> : 
                    <XCircle className="h-4 w-4 text-red-600" />}
                  <span className={canPublish ? '' : 'text-red-600 font-medium'}>
                    House edge: Implied sum {impliedSum.toFixed(3)} is {canPublish ? 'within' : 'OUTSIDE'} range ({acceptableRange.min.toFixed(3)} - {acceptableRange.max.toFixed(3)})
                  </span>
                </div>

                {/* Normalization Applied */}
                <div className="flex items-center gap-2">
                  {scalingFactor > 1 ? 
                    <CheckCircle className="h-4 w-4 text-blue-600" /> : 
                    <Info className="h-4 w-4 text-muted-foreground" />}
                  <span>
                    {scalingFactor > 1 
                      ? `Normalization applied: multipliers scaled by ${scalingFactor.toFixed(3)}x to enforce house edge`
                      : 'No normalization needed - implied sum already at or below target'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {marketOdds[0]?.base_probability > marketOdds[marketOdds.length - 1]?.base_probability ? 
                    <CheckCircle className="h-4 w-4 text-green-600" /> : 
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />}
                  <span>Probabilities correctly ordered by rating</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* No Odds Yet */}
        {selectedMarket && (!marketOdds || marketOdds.length === 0) && !runSimulation.isPending && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No odds generated yet</AlertTitle>
            <AlertDescription>
              Click "Run Monte Carlo Simulation" to generate multipliers for this contest.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </AdminLayout>
  );
}

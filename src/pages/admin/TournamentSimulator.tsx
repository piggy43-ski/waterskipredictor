import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Play, CheckCircle2, AlertTriangle, XCircle, TrendingUp, TrendingDown, DollarSign, Percent, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface MarketResult {
  market_id: string;
  market_name: string;
  market_type: string;
  discipline: string;
  category: string;
  expected_profit: number;
  loss_probability: number;
  profit_p05: number;
  profit_p95: number;
  implied_sum: number;
  implied_sum_status: 'OK' | 'WARNING' | 'BLOCKED';
  athletes_count: number;
  hypothetical_pool: number;
}

interface SimulationResult {
  tournament_id: string;
  tournament_name: string;
  total_markets: number;
  markets_analyzed: number;
  expected_profit: number;
  loss_probability: number;
  profit_p05: number;
  profit_p95: number;
  total_hypothetical_pool: number;
  market_results: MarketResult[];
  validation: {
    all_markets_have_odds: boolean;
    all_implied_sums_in_range: boolean;
    all_multipliers_capped: boolean;
    no_rank_inversions: boolean;
    ready_to_publish: boolean;
  };
  status: 'SAFE' | 'RISK' | 'BLOCKED';
}

export default function TournamentSimulator() {
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [poolSize, setPoolSize] = useState(10000);
  const [simulations, setSimulations] = useState(10000);
  const [strategy, setStrategy] = useState<'proportional' | 'uniform' | 'favorite_heavy'>('proportional');
  const [result, setResult] = useState<SimulationResult | null>(null);

  // Fetch tournaments with markets
  const { data: tournaments, isLoading: loadingTournaments } = useQuery({
    queryKey: ['tournaments-with-markets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select(`
          id,
          name,
          start_date,
          status,
          markets!inner(id)
        `)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return data?.map(t => ({
        id: t.id,
        name: t.name,
        start_date: t.start_date,
        status: t.status,
        market_count: t.markets?.length || 0
      })) || [];
    }
  });

  // Simulation mutation
  const simulationMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('simulate-tournament-profit', {
        body: {
          tournament_id: selectedTournament,
          simulations,
          hypothetical_pool: poolSize,
          betting_strategy: strategy
        }
      });

      if (error) throw error;
      return data as SimulationResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success('Simulation complete!');
    },
    onError: (error) => {
      toast.error(`Simulation failed: ${error.message}`);
    }
  });

  const getStatusIcon = (status: 'SAFE' | 'RISK' | 'BLOCKED') => {
    switch (status) {
      case 'SAFE': return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'RISK': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'BLOCKED': return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusBadge = (status: 'SAFE' | 'RISK' | 'BLOCKED') => {
    switch (status) {
      case 'SAFE': return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">SAFE</Badge>;
      case 'RISK': return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">RISK</Badge>;
      case 'BLOCKED': return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">BLOCKED</Badge>;
    }
  };

  const getImpliedSumBadge = (status: 'OK' | 'WARNING' | 'BLOCKED') => {
    switch (status) {
      case 'OK': return <Badge variant="outline" className="text-green-400 border-green-500/30">OK</Badge>;
      case 'WARNING': return <Badge variant="outline" className="text-yellow-400 border-yellow-500/30">WARN</Badge>;
      case 'BLOCKED': return <Badge variant="outline" className="text-red-400 border-red-500/30">BLOCKED</Badge>;
    }
  };

  // Prepare chart data
  const chartData = result?.market_results.map(m => ({
    name: m.market_name.replace(' Winner', '').replace('Open ', ''),
    profit: m.expected_profit,
    loss_prob: m.loss_probability * 100
  })) || [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tournament Profitability Simulator</h1>
          <p className="text-muted-foreground mt-1">
            Validate multipliers with Monte Carlo simulation before opening to users
          </p>
        </div>

        {/* Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle>Simulation Configuration</CardTitle>
            <CardDescription>
              Select a tournament and configure simulation parameters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="lg:col-span-2">
                <Label>Tournament</Label>
                <Select value={selectedTournament} onValueChange={setSelectedTournament}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tournament..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tournaments?.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.market_count} markets)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Pool Size (tokens)</Label>
                <Input
                  type="number"
                  value={poolSize}
                  onChange={(e) => setPoolSize(Number(e.target.value))}
                  min={1000}
                  max={1000000}
                />
              </div>

              <div>
                <Label>Simulations</Label>
                <Input
                  type="number"
                  value={simulations}
                  onChange={(e) => setSimulations(Number(e.target.value))}
                  min={1000}
                  max={100000}
                />
              </div>

              <div>
                <Label>Betting Strategy</Label>
                <Select value={strategy} onValueChange={(v) => setStrategy(v as typeof strategy)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="proportional">Proportional (Smart)</SelectItem>
                    <SelectItem value="uniform">Uniform (Equal)</SelectItem>
                    <SelectItem value="favorite_heavy">Favorite Heavy (70/30)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4">
              <Button
                onClick={() => simulationMutation.mutate()}
                disabled={!selectedTournament || simulationMutation.isPending}
                className="w-full md:w-auto"
              >
                {simulationMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running Simulation...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Run Simulation
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <>
            {/* Status Banner */}
            <Alert className={
              result.status === 'SAFE' ? 'border-green-500/50 bg-green-500/10' :
              result.status === 'RISK' ? 'border-yellow-500/50 bg-yellow-500/10' :
              'border-red-500/50 bg-red-500/10'
            }>
              <div className="flex items-center gap-2">
                {getStatusIcon(result.status)}
                <AlertTitle className="mb-0">
                  {result.status === 'SAFE' && 'Tournament multipliers are correctly configured'}
                  {result.status === 'RISK' && 'Some markets need attention'}
                  {result.status === 'BLOCKED' && 'Critical issues must be resolved'}
                </AlertTitle>
              </div>
              <AlertDescription className="mt-2">
                {result.validation.ready_to_publish 
                  ? 'All validation checks passed. This tournament is ready for publishing.'
                  : 'Review the validation checklist below to identify issues.'}
              </AlertDescription>
            </Alert>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Expected Profit</p>
                      <p className={`text-2xl font-bold ${result.expected_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {result.expected_profit >= 0 ? '+' : ''}{result.expected_profit.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {((result.expected_profit / result.total_hypothetical_pool) * 100).toFixed(2)}% of pool
                      </p>
                    </div>
                    <DollarSign className={`h-8 w-8 ${result.expected_profit >= 0 ? 'text-green-500/50' : 'text-red-500/50'}`} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Loss Probability</p>
                      <p className={`text-2xl font-bold ${result.loss_probability < 0.1 ? 'text-green-400' : 'text-red-400'}`}>
                        {(result.loss_probability * 100).toFixed(2)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Target: &lt;10%
                      </p>
                    </div>
                    <Percent className={`h-8 w-8 ${result.loss_probability < 0.1 ? 'text-green-500/50' : 'text-red-500/50'}`} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Worst Case (P5)</p>
                      <p className={`text-2xl font-bold ${result.profit_p05 >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {result.profit_p05 >= 0 ? '+' : ''}{result.profit_p05.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        5th percentile
                      </p>
                    </div>
                    <TrendingDown className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Best Case (P95)</p>
                      <p className="text-2xl font-bold text-green-400">
                        +{result.profit_p95.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        95th percentile
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-green-500/50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Validation Checklist */}
            <Card>
              <CardHeader>
                <CardTitle>Validation Checklist</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {[
                    { key: 'all_markets_have_odds', label: 'All Markets Have Multipliers' },
                    { key: 'all_implied_sums_in_range', label: 'Implied Sums in Range' },
                    { key: 'all_multipliers_capped', label: 'Multipliers Within Caps' },
                    { key: 'no_rank_inversions', label: 'No Rank Inversions' },
                    { key: 'ready_to_publish', label: 'Ready to Publish' },
                  ].map(check => (
                    <div key={check.key} className="flex items-center gap-2">
                      {result.validation[check.key as keyof typeof result.validation] 
                        ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                        : <XCircle className="h-5 w-5 text-red-500" />
                      }
                      <span className="text-sm">{check.label}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Profit Chart */}
            {chartData.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Expected Profit by Market
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 40 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis 
                          dataKey="name" 
                          angle={-45} 
                          textAnchor="end" 
                          height={60}
                          className="text-xs fill-muted-foreground"
                        />
                        <YAxis className="text-xs fill-muted-foreground" />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                          formatter={(value: number) => [`${value.toLocaleString()} tokens`, 'Expected Profit']}
                        />
                        <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.profit >= 0 ? 'hsl(142, 76%, 36%)' : 'hsl(0, 84%, 60%)'} 
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Market Results Table */}
            <Card>
              <CardHeader>
                <CardTitle>Market Breakdown</CardTitle>
                <CardDescription>
                  Per-market simulation results ({result.markets_analyzed} of {result.total_markets} analyzed)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Market</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Athletes</TableHead>
                      <TableHead className="text-right">Implied Sum</TableHead>
                      <TableHead className="text-right">Expected Profit</TableHead>
                      <TableHead className="text-right">Loss %</TableHead>
                      <TableHead className="text-right">Worst Case</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.market_results.map(market => (
                      <TableRow key={market.market_id}>
                        <TableCell className="font-medium">{market.market_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{market.market_type}</Badge>
                        </TableCell>
                        <TableCell>{market.athletes_count}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(market.implied_sum * 100).toFixed(1)}%
                            {getImpliedSumBadge(market.implied_sum_status)}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${market.expected_profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {market.expected_profit >= 0 ? '+' : ''}{market.expected_profit.toLocaleString()}
                        </TableCell>
                        <TableCell className={`text-right ${market.loss_probability < 0.1 ? 'text-green-400' : 'text-yellow-400'}`}>
                          {(market.loss_probability * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className={`text-right ${market.profit_p05 >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {market.profit_p05 >= 0 ? '+' : ''}{market.profit_p05.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {market.athletes_count > 0 
                            ? getImpliedSumBadge(market.implied_sum_status)
                            : <Badge variant="outline" className="text-muted-foreground">No Data</Badge>
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {/* Empty State */}
        {!result && !simulationMutation.isPending && (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Simulation Results</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Select a tournament and run a Monte Carlo simulation to validate that multipliers
                are configured correctly and the house maintains positive expected value.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

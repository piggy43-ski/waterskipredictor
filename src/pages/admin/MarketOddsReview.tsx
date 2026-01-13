import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Lock, Unlock, AlertTriangle, CheckCircle } from 'lucide-react';

interface MarketOddsRow {
  id: string;
  market_id: string;
  athlete_id: string;
  base_probability: number;
  base_decimal_odds: number;
  manual_multiplier: number;
  final_decimal_odds: number;
  token_price: number;
  is_frozen: boolean;
  generated_at: string;
  athletes: { name: string; country: string };
}

export default function MarketOddsReview() {
  const queryClient = useQueryClient();
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  const [localMultipliers, setLocalMultipliers] = useState<Record<string, number>>({});

  // Fetch tournaments
  const { data: tournaments } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, start_date')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch markets for selected tournament
  const { data: markets } = useQuery({
    queryKey: ['admin-markets', selectedTournament],
    queryFn: async () => {
      if (!selectedTournament) return [];
      const { data, error } = await supabase
        .from('markets')
        .select('id, name, discipline, category, market_type')
        .eq('tournament_id', selectedTournament);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTournament,
  });

  // Fetch odds for selected market
  const { data: marketOdds, refetch: refetchOdds } = useQuery({
    queryKey: ['admin-market-odds', selectedMarket],
    queryFn: async () => {
      if (!selectedMarket) return [];
      const { data, error } = await supabase
        .from('market_odds')
        .select(`
          id,
          market_id,
          athlete_id,
          base_probability,
          base_decimal_odds,
          manual_multiplier,
          final_decimal_odds,
          token_price,
          is_frozen,
          generated_at,
          athletes(name, country)
        `)
        .eq('market_id', selectedMarket)
        .order('base_probability', { ascending: false });
      if (error) throw error;
      return data as MarketOddsRow[];
    },
    enabled: !!selectedMarket,
  });

  // Calculate implied sum
  const impliedSum = marketOdds?.reduce((sum, row) => {
    const multiplier = localMultipliers[row.athlete_id] ?? row.manual_multiplier;
    const finalOdds = row.base_decimal_odds * multiplier;
    return sum + (1 / finalOdds);
  }, 0) ?? 0;

  // Update multiplier mutation
  const updateMultiplierMutation = useMutation({
    mutationFn: async ({ athleteId, multiplier }: { athleteId: string; multiplier: number }) => {
      const { error } = await supabase
        .from('market_odds')
        .update({ 
          manual_multiplier: multiplier,
          final_decimal_odds: Math.round((marketOdds?.find(o => o.athlete_id === athleteId)?.base_decimal_odds ?? 1) * multiplier * 100) / 100,
        })
        .eq('market_id', selectedMarket)
        .eq('athlete_id', athleteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-market-odds'] });
      toast.success('Multiplier updated');
    },
    onError: (error: any) => {
      toast.error('Failed to update: ' + error.message);
    },
  });

  // Toggle freeze mutation
  const toggleFreezeMutation = useMutation({
    mutationFn: async (isFrozen: boolean) => {
      const { error } = await supabase
        .from('market_odds')
        .update({ is_frozen: isFrozen })
        .eq('market_id', selectedMarket);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-market-odds'] });
      toast.success('Contest freeze status updated');
    },
    onError: (error: any) => {
      toast.error('Failed to update: ' + error.message);
    },
  });

  // Regenerate odds mutation
  const regenerateOddsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-market-odds', {
        body: { market_id: selectedMarket, force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Multipliers regenerated. Implied sum: ${data.implied_sum.toFixed(3)}`);
      queryClient.invalidateQueries({ queryKey: ['admin-market-odds'] });
      setLocalMultipliers({});
    },
    onError: (error: any) => {
      toast.error('Failed to regenerate: ' + error.message);
    },
  });

  const handleMultiplierChange = (athleteId: string, value: number[]) => {
    setLocalMultipliers(prev => ({ ...prev, [athleteId]: value[0] }));
  };

  const handleMultiplierCommit = (athleteId: string) => {
    const multiplier = localMultipliers[athleteId];
    if (multiplier !== undefined) {
      updateMultiplierMutation.mutate({ athleteId, multiplier });
    }
  };

  const getImpliedSumStatus = () => {
    if (impliedSum < 1.05) return { status: 'danger', message: 'Too low - unprofitable' };
    if (impliedSum > 1.25) return { status: 'warning', message: 'High overround - may deter entries' };
    return { status: 'success', message: 'Healthy margin' };
  };

  const isFrozen = marketOdds?.[0]?.is_frozen ?? false;
  const selectedMarketData = markets?.find(m => m.id === selectedMarket);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Multiplier Review</h1>
          <p className="text-muted-foreground">Review and adjust contest multipliers with manual overrides</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Contest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Select value={selectedTournament} onValueChange={(v) => { setSelectedTournament(v); setSelectedMarket(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tournament" />
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
              <div>
                <Select value={selectedMarket} onValueChange={setSelectedMarket} disabled={!selectedTournament}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contest" />
                  </SelectTrigger>
                  <SelectContent>
                    {markets?.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.discipline} - {m.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedMarket && marketOdds && marketOdds.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Contest Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="text-lg">
                    {selectedMarketData?.market_type}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Implied Sum</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold">{impliedSum.toFixed(3)}</span>
                    {getImpliedSumStatus().status === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                    {getImpliedSumStatus().status === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-500" />}
                    {getImpliedSumStatus().status === 'danger' && <AlertTriangle className="w-5 h-5 text-red-500" />}
                  </div>
                  <p className="text-sm text-muted-foreground">{getImpliedSumStatus().message}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {isFrozen ? (
                      <Badge variant="destructive" className="flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Frozen
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Unlock className="w-3 h-3" /> Open
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {getImpliedSumStatus().status !== 'success' && (
              <Alert variant={getImpliedSumStatus().status === 'danger' ? 'destructive' : 'default'}>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Implied Sum Warning</AlertTitle>
                <AlertDescription>
                  {getImpliedSumStatus().status === 'danger' 
                    ? 'The implied sum is too low, which means the platform may lose money on this contest.'
                    : 'The implied sum is quite high, which may discourage users from making entries.'}
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Athlete Multipliers</CardTitle>
                <CardDescription>Adjust manual multiplier (0.90 - 1.10) to fine-tune final multipliers</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Athlete</TableHead>
                      <TableHead>Base Probability</TableHead>
                      <TableHead>Base Multiplier</TableHead>
                      <TableHead className="w-48">Manual Adjustment</TableHead>
                      <TableHead>Final Multiplier</TableHead>
                      <TableHead>Token Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marketOdds.map(row => {
                      const currentMultiplier = localMultipliers[row.athlete_id] ?? row.manual_multiplier;
                      const finalOdds = Math.round(row.base_decimal_odds * currentMultiplier * 100) / 100;
                      
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="font-medium">{row.athletes?.name}</div>
                            <div className="text-xs text-muted-foreground">{row.athletes?.country}</div>
                          </TableCell>
                          <TableCell>{(row.base_probability * 100).toFixed(1)}%</TableCell>
                          <TableCell>{row.base_decimal_odds.toFixed(2)}x</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Slider
                                min={0.90}
                                max={1.10}
                                step={0.01}
                                value={[currentMultiplier]}
                                onValueChange={(v) => handleMultiplierChange(row.athlete_id, v)}
                                onValueCommit={() => handleMultiplierCommit(row.athlete_id)}
                                className="w-32"
                                disabled={isFrozen}
                              />
                              <span className="text-sm w-12">{currentMultiplier.toFixed(2)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono">
                              {finalOdds.toFixed(2)}x
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {row.token_price?.toLocaleString() ?? '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                <Button
                  onClick={() => regenerateOddsMutation.mutate()}
                  disabled={regenerateOddsMutation.isPending}
                  variant="secondary"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${regenerateOddsMutation.isPending ? 'animate-spin' : ''}`} />
                  Regenerate Multipliers
                </Button>
                <Button
                  onClick={() => toggleFreezeMutation.mutate(!isFrozen)}
                  disabled={toggleFreezeMutation.isPending}
                  variant={isFrozen ? 'outline' : 'destructive'}
                >
                  {isFrozen ? (
                    <>
                      <Unlock className="w-4 h-4 mr-2" />
                      Unfreeze Contest
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Freeze Contest
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {selectedMarket && (!marketOdds || marketOdds.length === 0) && (
          <Alert>
            <AlertDescription>
              No multipliers generated yet for this contest. Go to Contest Results to generate them.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </AdminLayout>
  );
}

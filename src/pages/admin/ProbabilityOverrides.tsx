import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { RefreshCw, RotateCcw, Save, AlertTriangle, CheckCircle, XCircle, Percent, Calculator } from "lucide-react";

interface AthleteOverride {
  athlete_id: string;
  athlete_name: string;
  field_rank: number;
  p_auto: number;
  p_manual: number | null;
  p_final: number;
  multiplier_preview: number;
  source: 'auto' | 'manual';
  override_id: string | null;
  reason: string | null;
}

interface OverrideMetrics {
  implied_sum: number;
  implied_sum_pct: string;
  status: 'OK' | 'WARNING' | 'BLOCKED';
  target_band: { min: number; max: number };
  target_band_pct: string;
  total_athletes: number;
  manual_count: number;
  probability_sum: number;
}

interface OverrideResponse {
  success: boolean;
  market: { id: string; type: string };
  athletes: AthleteOverride[];
  metrics: OverrideMetrics;
  caps: { min: number; max: number };
}

export default function ProbabilityOverrides() {
  const queryClient = useQueryClient();
  const [selectedTournament, setSelectedTournament] = useState<string>("");
  const [selectedMarket, setSelectedMarket] = useState<string>("");
  const [localProbabilities, setLocalProbabilities] = useState<Record<string, number>>({});

  // Fetch tournaments
  const { data: tournaments } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, start_date')
        .order('start_date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    }
  });

  // Fetch markets for selected tournament
  const { data: markets } = useQuery({
    queryKey: ['admin-markets', selectedTournament],
    queryFn: async () => {
      if (!selectedTournament) return [];
      const { data, error } = await supabase
        .from('markets')
        .select('id, name, market_type, discipline, category')
        .eq('tournament_id', selectedTournament)
        .in('market_type', ['WINNER', 'PODIUM', 'HIGHEST_SCORE'])
        .order('discipline', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTournament
  });

  // Fetch override data
  const { data: overrideData, isLoading: loadingOverrides, refetch: refetchOverrides } = useQuery({
    queryKey: ['probability-overrides', selectedMarket],
    queryFn: async () => {
      if (!selectedMarket) return null;
      const { data, error } = await supabase.functions.invoke<OverrideResponse>('manage-probability-overrides', {
        body: { action: 'list', market_id: selectedMarket }
      });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedMarket
  });

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: async ({ athlete_id, probability }: { athlete_id: string; probability: number }) => {
      const { data, error } = await supabase.functions.invoke('manage-probability-overrides', {
        body: { action: 'upsert', market_id: selectedMarket, athlete_id, manual_probability: probability }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['probability-overrides', selectedMarket] });
      toast.success('Probability saved');
    },
    onError: (err: Error) => {
      toast.error(err.message);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (athlete_id: string) => {
      const { data, error } = await supabase.functions.invoke('manage-probability-overrides', {
        body: { action: 'delete', market_id: selectedMarket, athlete_id }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['probability-overrides', selectedMarket] });
      toast.success('Reset to auto');
    }
  });

  // Bulk normalize
  const normalizeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-probability-overrides', {
        body: { action: 'bulk_normalize', market_id: selectedMarket }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['probability-overrides', selectedMarket] });
      toast.success('Probabilities normalized to 100%');
    }
  });

  // Bulk reset
  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-probability-overrides', {
        body: { action: 'bulk_reset', market_id: selectedMarket }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setLocalProbabilities({});
      queryClient.invalidateQueries({ queryKey: ['probability-overrides', selectedMarket] });
      toast.success('All overrides reset to auto');
    }
  });

  // Apply (regenerate odds)
  const applyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-probability-overrides', {
        body: { action: 'apply', market_id: selectedMarket }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['probability-overrides', selectedMarket] });
      toast.success('Odds regenerated with manual probabilities');
    }
  });

  const handleProbabilityChange = (athleteId: string, value: number) => {
    setLocalProbabilities(prev => ({ ...prev, [athleteId]: value }));
  };

  const handleSave = (athleteId: string) => {
    const prob = localProbabilities[athleteId];
    if (prob !== undefined) {
      upsertMutation.mutate({ athlete_id: athleteId, probability: prob });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'OK': return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'WARNING': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'BLOCKED': return <XCircle className="h-5 w-5 text-red-500" />;
      default: return null;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'OK': return 'default';
      case 'WARNING': return 'secondary';
      case 'BLOCKED': return 'destructive';
      default: return 'outline';
    }
  };

  const selectedMarketData = markets?.find(m => m.id === selectedMarket);
  const metrics = overrideData?.metrics;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Probability Overrides</h1>
          <p className="text-muted-foreground mt-1">
            Manually adjust win/podium probabilities per athlete. Multipliers auto-calculate from probabilities.
          </p>
        </div>

        {/* Selection Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Tournament</label>
            <Select value={selectedTournament} onValueChange={(v) => { setSelectedTournament(v); setSelectedMarket(""); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select tournament..." />
              </SelectTrigger>
              <SelectContent>
                {tournaments?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">Market</label>
            <Select value={selectedMarket} onValueChange={setSelectedMarket} disabled={!selectedTournament}>
              <SelectTrigger>
                <SelectValue placeholder="Select market..." />
              </SelectTrigger>
              <SelectContent>
                {markets?.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.market_type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Metrics Panel */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Probability Sum</span>
                  <Percent className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold mt-1">
                  {(metrics.probability_sum * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-muted-foreground">Should be 100%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Implied Sum</span>
                  <Calculator className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  {metrics.implied_sum_pct}
                  {getStatusIcon(metrics.status)}
                </div>
                <p className="text-xs text-muted-foreground">Target: {metrics.target_band_pct}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="mt-1">
                  <Badge variant={getStatusBadgeVariant(metrics.status) as any}>
                    {metrics.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Manual Overrides</div>
                <div className="text-2xl font-bold mt-1">
                  {metrics.manual_count} / {metrics.total_athletes}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Risk Alert */}
        {metrics?.status === 'BLOCKED' && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>House Risk Detected</AlertTitle>
            <AlertDescription>
              Implied sum {metrics.implied_sum_pct} is outside target band {metrics.target_band_pct}. 
              Normalize probabilities or adjust individual values before publishing.
            </AlertDescription>
          </Alert>
        )}
        {metrics?.status === 'WARNING' && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              Implied sum {metrics.implied_sum_pct} is near the edge of target band {metrics.target_band_pct}.
            </AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        {selectedMarket && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => refetchOverrides()}
              disabled={loadingOverrides}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => normalizeMutation.mutate()}
              disabled={normalizeMutation.isPending}
            >
              <Percent className="mr-2 h-4 w-4" />
              Normalize to 100%
            </Button>
            <Button
              variant="outline"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset All to Auto
            </Button>
            <Button
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending || metrics?.status === 'BLOCKED'}
            >
              <Save className="mr-2 h-4 w-4" />
              Apply & Regenerate Odds
            </Button>
          </div>
        )}

        {/* Athletes Table */}
        {selectedMarket && overrideData?.athletes && (
          <Card>
            <CardHeader>
              <CardTitle>Athlete Probabilities</CardTitle>
              <CardDescription>
                Adjust win probabilities. Multipliers are calculated automatically with house edge.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Athlete</TableHead>
                    <TableHead className="text-right">Auto Prob</TableHead>
                    <TableHead className="w-48">Manual Prob</TableHead>
                    <TableHead className="text-right">Final Prob</TableHead>
                    <TableHead className="text-right">Multiplier</TableHead>
                    <TableHead className="text-center">Source</TableHead>
                    <TableHead className="w-24">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overrideData.athletes.map((athlete) => {
                    const localProb = localProbabilities[athlete.athlete_id];
                    const displayProb = localProb !== undefined ? localProb : (athlete.p_manual ?? athlete.p_auto);
                    const hasLocalChange = localProb !== undefined && localProb !== (athlete.p_manual ?? athlete.p_auto);
                    
                    return (
                      <TableRow key={athlete.athlete_id}>
                        <TableCell className="font-medium">#{athlete.field_rank}</TableCell>
                        <TableCell>{athlete.athlete_name}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {(athlete.p_auto * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[displayProb * 100]}
                              min={0.5}
                              max={50}
                              step={0.5}
                              onValueChange={([v]) => handleProbabilityChange(athlete.athlete_id, v / 100)}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              value={(displayProb * 100).toFixed(1)}
                              onChange={(e) => handleProbabilityChange(athlete.athlete_id, parseFloat(e.target.value) / 100)}
                              className="w-20 text-right"
                              step="0.5"
                              min="0.5"
                              max="50"
                            />
                            <span className="text-muted-foreground">%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {(athlete.p_final * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          {athlete.multiplier_preview.toFixed(2)}x
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant={athlete.source === 'manual' ? 'default' : 'outline'}>
                            {athlete.source}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant={hasLocalChange ? "default" : "outline"}
                              onClick={() => handleSave(athlete.athlete_id)}
                              disabled={upsertMutation.isPending}
                            >
                              <Save className="h-3 w-3" />
                            </Button>
                            {athlete.source === 'manual' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => deleteMutation.mutate(athlete.athlete_id)}
                                disabled={deleteMutation.isPending}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {selectedMarket && !overrideData?.athletes?.length && !loadingOverrides && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Odds Data</AlertTitle>
            <AlertDescription>
              No odds have been generated for this market yet. Generate odds first before setting probability overrides.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </AdminLayout>
  );
}

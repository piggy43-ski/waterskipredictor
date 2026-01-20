import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { RefreshCw, Copy, RotateCcw, Save, AlertTriangle, CheckCircle, XCircle, Shield } from 'lucide-react';
import {
  MULTIPLIER_CAPS,
  TARGET_IMPLIED_SUM,
  type MarketTypeKey
} from '@/utils/multiplierCaps';

interface AthleteOverride {
  athlete_id: string;
  athlete_name: string;
  rank: number;
  auto_multiplier: number;
  manual_multiplier: number | null;
  final_multiplier: number;
  source: 'manual' | 'auto';
  is_enabled: boolean;
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
}

interface OverrideResponse {
  success: boolean;
  market: any;
  athletes: AthleteOverride[];
  metrics: OverrideMetrics;
  caps: { min: number; max: number };
}

export default function MultiplierOverrides() {
  const queryClient = useQueryClient();
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  const [localEdits, setLocalEdits] = useState<Record<string, number>>({});
  const [enforceMonotonic, setEnforceMonotonic] = useState(true);

  // Fetch tournaments
  const { data: tournaments } = useQuery({
    queryKey: ['admin-tournaments-overrides'],
    queryFn: async () => {
      const { data } = await supabase
        .from('tournaments')
        .select('id, name, status')
        .order('start_date', { ascending: false });
      return data || [];
    }
  });

  // Fetch markets for selected tournament
  const { data: markets } = useQuery({
    queryKey: ['admin-markets-overrides', selectedTournament],
    queryFn: async () => {
      if (!selectedTournament) return [];
      const { data } = await supabase
        .from('markets')
        .select('id, name, market_type, discipline, category')
        .eq('tournament_id', selectedTournament)
        .in('market_type', ['WINNER', 'PODIUM', 'HIGHEST_SCORE'])
        .order('discipline')
        .order('category');
      return data || [];
    },
    enabled: !!selectedTournament
  });

  // Fetch override data for selected market
  const { data: overrideData, isLoading: loadingOverrides, refetch: refetchOverrides } = useQuery({
    queryKey: ['market-overrides', selectedMarket],
    queryFn: async (): Promise<OverrideResponse | null> => {
      if (!selectedMarket) return null;
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: { action: 'list', market_id: selectedMarket }
      });

      if (error) throw error;
      return data as OverrideResponse;
    },
    enabled: !!selectedMarket
  });

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: async ({ athleteId, multiplier, reason }: { athleteId: string; multiplier: number; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: {
          action: 'upsert',
          market_id: selectedMarket,
          athlete_id: athleteId,
          manual_multiplier: multiplier,
          reason,
          enforce_monotonic: enforceMonotonic
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['market-overrides', selectedMarket], data);
      toast.success('Multiplier updated');
      // Clear local edit for this athlete
      setLocalEdits(prev => {
        const next = { ...prev };
        delete next[data.override?.athlete_id];
        return next;
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (athleteId: string) => {
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: {
          action: 'delete',
          market_id: selectedMarket,
          athlete_id: athleteId
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['market-overrides', selectedMarket], data);
      toast.success('Override removed');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Bulk copy mutation
  const bulkCopyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: { action: 'bulk_copy', market_id: selectedMarket }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['market-overrides', selectedMarket], data);
      toast.success(`Copied ${data.copied} multipliers to manual`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  // Bulk reset mutation
  const bulkResetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: { action: 'bulk_reset', market_id: selectedMarket }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['market-overrides', selectedMarket], data);
      toast.success(`Reset ${data.deleted} overrides to auto`);
      setLocalEdits({});
    },
    onError: (error: Error) => {
      toast.error(error.message);
    }
  });

  const selectedMarketData = useMemo(() => {
    return markets?.find(m => m.id === selectedMarket);
  }, [markets, selectedMarket]);

  const marketType = selectedMarketData?.market_type as MarketTypeKey | undefined;
  const caps = marketType ? MULTIPLIER_CAPS[marketType] : { min: 2, max: 20 };

  const handleSliderChange = (athleteId: string, value: number[]) => {
    setLocalEdits(prev => ({ ...prev, [athleteId]: value[0] }));
  };

  const handleSave = (athlete: AthleteOverride) => {
    const newValue = localEdits[athlete.athlete_id];
    if (newValue !== undefined) {
      upsertMutation.mutate({ athleteId: athlete.athlete_id, multiplier: newValue });
    }
  };

  const getStatusBadge = (status: 'OK' | 'WARNING' | 'BLOCKED') => {
    switch (status) {
      case 'OK':
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />OK</Badge>;
      case 'WARNING':
        return <Badge className="bg-yellow-500"><AlertTriangle className="h-3 w-3 mr-1" />Warning</Badge>;
      case 'BLOCKED':
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Blocked</Badge>;
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Manual Multiplier Overrides</h1>
          <p className="text-muted-foreground">
            Override auto-generated multipliers for Winner, Podium, and Highest Score markets
          </p>
        </div>

        {/* Selection Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Select Market</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Tournament</label>
                <Select value={selectedTournament} onValueChange={(v) => { setSelectedTournament(v); setSelectedMarket(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tournament" />
                  </SelectTrigger>
                  <SelectContent>
                    {tournaments?.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Market</label>
                <Select value={selectedMarket} onValueChange={setSelectedMarket} disabled={!selectedTournament}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select market" />
                  </SelectTrigger>
                  <SelectContent>
                    {markets?.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.market_type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="monotonic"
                  checked={enforceMonotonic}
                  onCheckedChange={setEnforceMonotonic}
                />
                <label htmlFor="monotonic" className="text-sm">
                  Enforce monotonic (better rank = lower multiplier)
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metrics Panel */}
        {overrideData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Implied Sum</div>
                <div className="text-2xl font-bold">{overrideData.metrics.implied_sum_pct}%</div>
                <div className="text-xs text-muted-foreground">
                  Target: {overrideData.metrics.target_band_pct}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Status</div>
                <div className="mt-1">{getStatusBadge(overrideData.metrics.status)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Manual Overrides</div>
                <div className="text-2xl font-bold">
                  {overrideData.metrics.manual_count} / {overrideData.metrics.total_athletes}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-muted-foreground">Market Type</div>
                <div className="text-lg font-medium">{selectedMarketData?.market_type}</div>
                <div className="text-xs text-muted-foreground">
                  Caps: {caps.min}x – {caps.max}x
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Risk Alert */}
        {overrideData?.metrics.status === 'BLOCKED' && (
          <Alert variant="destructive">
            <Shield className="h-4 w-4" />
            <AlertTitle>House Safety Risk</AlertTitle>
            <AlertDescription>
              Implied sum ({overrideData.metrics.implied_sum_pct}%) is outside acceptable range.
              Adjust multipliers to bring within target band ({overrideData.metrics.target_band_pct}) before publishing.
            </AlertDescription>
          </Alert>
        )}

        {overrideData?.metrics.status === 'WARNING' && (
          <Alert className="border-yellow-500 bg-yellow-50">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800">Margin Warning</AlertTitle>
            <AlertDescription className="text-yellow-700">
              Implied sum ({overrideData.metrics.implied_sum_pct}%) is outside target but within tolerance.
              Consider adjusting for optimal house edge.
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        {selectedMarket && (
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => refetchOverrides()}
              disabled={loadingOverrides}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={() => bulkCopyMutation.mutate()}
              disabled={bulkCopyMutation.isPending}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy All Auto → Manual
            </Button>
            <Button
              variant="outline"
              onClick={() => bulkResetMutation.mutate()}
              disabled={bulkResetMutation.isPending}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset All to Auto
            </Button>
          </div>
        )}

        {/* Override Table */}
        {selectedMarket && overrideData && (
          <Card>
            <CardHeader>
              <CardTitle>Athlete Multipliers</CardTitle>
              <CardDescription>
                Adjust individual multipliers. Changes are saved per athlete.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Rank</TableHead>
                    <TableHead>Athlete</TableHead>
                    <TableHead className="w-24">Auto</TableHead>
                    <TableHead className="w-64">Manual Override</TableHead>
                    <TableHead className="w-24">Final</TableHead>
                    <TableHead className="w-20">Source</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overrideData.athletes.map((athlete) => {
                    const localValue = localEdits[athlete.athlete_id];
                    const displayValue = localValue ?? athlete.manual_multiplier ?? athlete.auto_multiplier;
                    const hasLocalChange = localValue !== undefined && localValue !== athlete.manual_multiplier;

                    return (
                      <TableRow key={athlete.athlete_id}>
                        <TableCell className="font-mono">#{athlete.rank}</TableCell>
                        <TableCell className="font-medium">{athlete.athlete_name}</TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {athlete.auto_multiplier.toFixed(2)}x
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Slider
                              value={[displayValue]}
                              min={caps.min}
                              max={caps.max}
                              step={0.05}
                              onValueChange={(v) => handleSliderChange(athlete.athlete_id, v)}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              value={displayValue.toFixed(2)}
                              onChange={(e) => handleSliderChange(athlete.athlete_id, [parseFloat(e.target.value) || caps.min])}
                              className="w-20 text-center font-mono"
                              step={0.05}
                              min={caps.min}
                              max={caps.max}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono font-bold">
                          {(hasLocalChange ? localValue : athlete.final_multiplier).toFixed(2)}x
                        </TableCell>
                        <TableCell>
                          <Badge variant={athlete.source === 'manual' ? 'default' : 'secondary'}>
                            {athlete.source}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {hasLocalChange && (
                              <Button
                                size="sm"
                                onClick={() => handleSave(athlete)}
                                disabled={upsertMutation.isPending}
                              >
                                <Save className="h-3 w-3" />
                              </Button>
                            )}
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

        {/* Empty State */}
        {!selectedMarket && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Select a tournament and market to manage multiplier overrides
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

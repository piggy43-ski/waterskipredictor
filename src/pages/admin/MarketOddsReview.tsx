import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { RefreshCw, Lock, Unlock, AlertTriangle, CheckCircle, Pencil, Trash2, Copy, RotateCcw, Zap, Info } from 'lucide-react';

interface AthleteOverride {
  athlete_id: string;
  athlete_name: string;
  rank: number;
  auto_multiplier: number;
  manual_multiplier: number | null;
  final_multiplier: number;
  source: 'auto' | 'manual';
  is_enabled: boolean;
  override_id: string | null;
  reason: string | null;
}

interface OverrideMetrics {
  implied_sum: number;
  implied_sum_pct: string;
  status: 'OK' | 'CALIBRATED' | 'WARNING' | 'NEEDS_REVIEW';
  target_band: { min: number; max: number };
  target_band_pct: string;
  total_athletes: number;
  manual_count: number;
  // New fields
  auto_implied_sum: number;
  auto_implied_sum_pct: string;
  auto_status: 'OK' | 'CALIBRATED' | 'WARNING' | 'NEEDS_REVIEW';
  overrides_causing_issue: boolean;
}

interface OverrideResponse {
  success: boolean;
  market: { id: string; market_type: string; name: string };
  athletes: AthleteOverride[];
  metrics: OverrideMetrics;
  caps: { min: number; max: number };
}

export default function MarketOddsReview() {
  const queryClient = useQueryClient();
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  
  // Override dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState<AthleteOverride | null>(null);
  const [editMultiplier, setEditMultiplier] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');
  
  // Confirm dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'clear_regenerate' | 'bulk_reset' | null>(null);
  
  // Inline edit state
  const [inlineEditingId, setInlineEditingId] = useState<string | null>(null);
  const [inlineValue, setInlineValue] = useState<string>('');

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

  // Fetch overrides for selected market using edge function
  const { data: overrideData, refetch: refetchOverrides, isLoading: isLoadingOverrides } = useQuery({
    queryKey: ['admin-multiplier-overrides', selectedMarket],
    queryFn: async () => {
      if (!selectedMarket) return null;
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: { action: 'list', market_id: selectedMarket },
      });
      if (error) throw error;
      return data as OverrideResponse;
    },
    enabled: !!selectedMarket,
  });

  // Upsert override mutation
  const upsertMutation = useMutation({
    mutationFn: async ({ athleteId, multiplier, reason }: { athleteId: string; multiplier: number; reason: string }) => {
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: {
          action: 'upsert',
          market_id: selectedMarket,
          athlete_id: athleteId,
          manual_multiplier: multiplier,
          reason: reason || null,
          is_enabled: true,
        },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to save override');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-multiplier-overrides'] });
      toast.success(`Override saved: ${data.applied_multiplier}x${data.was_clamped ? ' (clamped to limits)' : ''}`);
      setEditDialogOpen(false);
      setEditingAthlete(null);
      setInlineEditingId(null);
    },
    onError: (error: any) => {
      toast.error('Failed to save: ' + error.message);
    },
  });

  // Delete override mutation
  const deleteMutation = useMutation({
    mutationFn: async (athleteId: string) => {
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: {
          action: 'delete',
          market_id: selectedMarket,
          athlete_id: athleteId,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-multiplier-overrides'] });
      toast.success('Override removed, reverted to auto multiplier');
    },
    onError: (error: any) => {
      toast.error('Failed to remove: ' + error.message);
    },
  });

  // Bulk copy all auto to manual
  const bulkCopyMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: { action: 'bulk_copy', market_id: selectedMarket },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-multiplier-overrides'] });
      toast.success('All multipliers copied to manual overrides');
    },
    onError: (error: any) => {
      toast.error('Failed: ' + error.message);
    },
  });

  // Bulk reset all overrides
  const bulkResetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: { action: 'bulk_reset', market_id: selectedMarket },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-multiplier-overrides'] });
      toast.success('All overrides removed, reverted to auto');
      setConfirmDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error('Failed: ' + error.message);
    },
  });

  // Clear overrides and regenerate - THE MAIN FIX
  const clearAndRegenerateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-multiplier-overrides', {
        body: { action: 'clear_and_regenerate', market_id: selectedMarket },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-multiplier-overrides'] });
      const status = data.regeneration?.calibration_status || 'unknown';
      const impliedSum = data.regeneration?.implied_sum?.toFixed(3) || 'N/A';
      toast.success(`Cleared ${data.overrides_cleared} overrides & regenerated. Status: ${status}, Implied sum: ${impliedSum}`);
      setConfirmDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error('Failed: ' + error.message);
    },
  });

  // Simple regenerate (without clearing overrides)
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-market-odds', {
        body: { market_id: selectedMarket, force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Auto multipliers regenerated. Implied sum: ${data.implied_sum?.toFixed(3) || 'N/A'}`);
      queryClient.invalidateQueries({ queryKey: ['admin-multiplier-overrides'] });
    },
    onError: (error: any) => {
      toast.error('Failed to regenerate: ' + error.message);
    },
  });

  const openEditDialog = (athlete: AthleteOverride) => {
    setEditingAthlete(athlete);
    setEditMultiplier(athlete.manual_multiplier?.toString() || athlete.auto_multiplier.toString());
    setEditReason(athlete.reason || '');
    setEditDialogOpen(true);
  };

  const handleSaveOverride = () => {
    if (!editingAthlete) return;
    const multiplier = parseFloat(editMultiplier);
    if (isNaN(multiplier) || multiplier <= 0) {
      toast.error('Please enter a valid multiplier');
      return;
    }
    upsertMutation.mutate({
      athleteId: editingAthlete.athlete_id,
      multiplier,
      reason: editReason,
    });
  };

  // Inline edit handlers
  const startInlineEdit = (athlete: AthleteOverride) => {
    setInlineEditingId(athlete.athlete_id);
    setInlineValue(athlete.manual_multiplier?.toString() || athlete.auto_multiplier.toString());
  };

  const handleInlineSave = (athlete: AthleteOverride) => {
    const multiplier = parseFloat(inlineValue);
    if (isNaN(multiplier) || multiplier <= 0) {
      toast.error('Please enter a valid multiplier');
      return;
    }
    upsertMutation.mutate({
      athleteId: athlete.athlete_id,
      multiplier,
      reason: athlete.reason || '',
    });
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent, athlete: AthleteOverride) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInlineSave(athlete);
    } else if (e.key === 'Escape') {
      setInlineEditingId(null);
    }
  };

  const handleConfirmAction = () => {
    if (confirmAction === 'clear_regenerate') {
      clearAndRegenerateMutation.mutate();
    } else if (confirmAction === 'bulk_reset') {
      bulkResetMutation.mutate();
    }
  };

  const openConfirmDialog = (action: 'clear_regenerate' | 'bulk_reset') => {
    setConfirmAction(action);
    setConfirmDialogOpen(true);
  };

  const getDeviationWarning = () => {
    if (!editingAthlete) return null;
    const manual = parseFloat(editMultiplier);
    if (isNaN(manual)) return null;
    
    const auto = editingAthlete.auto_multiplier;
    const deviation = ((manual - auto) / auto) * 100;
    
    if (Math.abs(deviation) > 30) {
      return {
        message: `${deviation > 0 ? '+' : ''}${deviation.toFixed(0)}% from auto (${auto.toFixed(2)}x)`,
        isHigher: deviation > 0,
      };
    }
    return null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OK': 
      case 'CALIBRATED': 
        return 'text-green-500';
      case 'WARNING': 
        return 'text-yellow-500';
      case 'NEEDS_REVIEW': 
        return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OK': return <Badge className="bg-green-500/20 text-green-500 border-green-500/30">OK</Badge>;
      case 'CALIBRATED': return <Badge className="bg-green-500/20 text-green-500 border-green-500/30"><CheckCircle className="h-3 w-3 mr-1" />CALIBRATED</Badge>;
      case 'WARNING': return <Badge className="bg-yellow-500/20 text-yellow-500 border-yellow-500/30">WARNING</Badge>;
      case 'NEEDS_REVIEW': return <Badge className="bg-orange-500/20 text-orange-500 border-orange-500/30"><AlertTriangle className="h-3 w-3 mr-1" />NEEDS REVIEW</Badge>;
      default: return null;
    }
  };

  const selectedMarketData = markets?.find(m => m.id === selectedMarket);
  const athletes = overrideData?.athletes || [];
  const metrics = overrideData?.metrics;
  const caps = overrideData?.caps || { min: 1.5, max: 20.0 };

  const isPending = clearAndRegenerateMutation.isPending || bulkResetMutation.isPending;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Multiplier Review</h1>
          <p className="text-muted-foreground">Manage multiplier values and calibrate markets to target implied sum</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Market</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">Tournament</Label>
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
                <Label className="mb-2 block">Market</Label>
                <Select value={selectedMarket} onValueChange={setSelectedMarket} disabled={!selectedTournament}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a market" />
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

        {selectedMarket && isLoadingOverrides && (
          <Alert>
            <RefreshCw className="h-4 w-4 animate-spin" />
            <AlertDescription>Loading multiplier data...</AlertDescription>
          </Alert>
        )}

        {selectedMarket && metrics && (
          <>
            {/* Metrics Cards */}
            <div className="grid grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Market Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="outline" className="text-lg">
                    {selectedMarketData?.market_type}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Current Implied Sum</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${getStatusColor(metrics.status)}`}>
                      {metrics.implied_sum_pct}%
                    </span>
                    {getStatusBadge(metrics.status)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Target: {metrics.target_band_pct}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Auto Implied Sum</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <span className={`text-xl font-mono ${getStatusColor(metrics.auto_status)}`}>
                      {metrics.auto_implied_sum_pct}%
                    </span>
                    {getStatusBadge(metrics.auto_status)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Without overrides</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Override Count</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{metrics.manual_count}</span>
                  <span className="text-muted-foreground ml-1">/ {metrics.total_athletes}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Multiplier Caps</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-lg font-mono">{caps.min}x – {caps.max}x</span>
                </CardContent>
              </Card>
            </div>

            {/* Overrides causing issue banner */}
            {metrics.overrides_causing_issue && (
              <Alert className="border-orange-500/50 bg-orange-500/10">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <AlertTitle className="text-orange-500">Overrides Causing Out-of-Band Pricing</AlertTitle>
                <AlertDescription className="text-orange-500/80">
                  The auto-generated odds are calibrated (Auto: {metrics.auto_implied_sum_pct}%), but {metrics.manual_count} manual override(s) 
                  are forcing the implied sum to {metrics.implied_sum_pct}%. 
                  <strong className="ml-1">Click "Clear Overrides & Regenerate" below to fix.</strong>
                </AlertDescription>
              </Alert>
            )}

            {metrics.status === 'NEEDS_REVIEW' && !metrics.overrides_causing_issue && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Implied Sum Out of Range</AlertTitle>
                <AlertDescription>
                  The implied sum ({metrics.implied_sum_pct}%) is outside the target band ({metrics.target_band_pct}). 
                  Click "Clear Overrides & Regenerate" to auto-calibrate the market.
                </AlertDescription>
              </Alert>
            )}
            
            {metrics.status === 'CALIBRATED' && (
              <Alert className="border-green-500/30 bg-green-500/10">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle className="text-green-500">Calibrated Successfully</AlertTitle>
                <AlertDescription className="text-green-500/80">
                  Implied sum is within target band. Market is ready for predictions.
                </AlertDescription>
              </Alert>
            )}

            {/* PRIMARY ACTION CARD */}
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Quick Actions
                </CardTitle>
                <CardDescription>
                  Use "Clear Overrides & Regenerate" to fix blocked or out-of-band markets
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-4">
                <Button
                  onClick={() => openConfirmDialog('clear_regenerate')}
                  disabled={isPending}
                  variant="default"
                  size="lg"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${clearAndRegenerateMutation.isPending ? 'animate-spin' : ''}`} />
                  Clear Overrides & Regenerate
                </Button>
                <Button
                  onClick={() => regenerateMutation.mutate()}
                  disabled={regenerateMutation.isPending}
                  variant="secondary"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
                  Regenerate Auto Only
                </Button>
              </CardContent>
            </Card>

            {/* Athletes Table */}
            <Card>
              <CardHeader>
                <CardTitle>Athlete Multipliers</CardTitle>
                <CardDescription>
                  Click on any multiplier value to edit it inline. Press Enter to save, Escape to cancel.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Athlete</TableHead>
                      <TableHead className="text-right">Auto</TableHead>
                      <TableHead className="text-right w-32">Override (click to edit)</TableHead>
                      <TableHead className="text-right">Final</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {athletes.map(athlete => (
                      <TableRow 
                        key={athlete.athlete_id}
                        className={athlete.source === 'manual' ? 'bg-primary/5' : ''}
                      >
                        <TableCell className="font-mono text-muted-foreground">
                          {athlete.rank}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{athlete.athlete_name}</span>
                            {athlete.source === 'manual' && (
                              <Badge variant="secondary" className="text-xs">MANUAL</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {athlete.auto_multiplier.toFixed(2)}x
                        </TableCell>
                        <TableCell className="text-right">
                          {inlineEditingId === athlete.athlete_id ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="number"
                                min={caps.min}
                                max={caps.max}
                                step={0.05}
                                value={inlineValue}
                                onChange={(e) => setInlineValue(e.target.value)}
                                onKeyDown={(e) => handleInlineKeyDown(e, athlete)}
                                onBlur={() => setInlineEditingId(null)}
                                className="w-20 h-8 font-mono text-sm text-right"
                                autoFocus
                              />
                              <span className="text-muted-foreground text-sm">x</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => startInlineEdit(athlete)}
                              className="font-mono cursor-pointer hover:bg-muted px-2 py-1 rounded transition-colors"
                            >
                              {athlete.manual_multiplier ? (
                                <span className="font-bold text-primary">
                                  {athlete.manual_multiplier.toFixed(2)}x
                                </span>
                              ) : (
                                <span className="text-muted-foreground hover:text-foreground">
                                  click to set
                                </span>
                              )}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge 
                            variant={athlete.source === 'manual' ? 'default' : 'outline'}
                            className="font-mono"
                          >
                            {athlete.final_multiplier.toFixed(2)}x
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {athlete.reason || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(athlete)}
                            >
                              <Pencil className="h-3 w-3 mr-1" />
                              {athlete.source === 'manual' ? 'Edit' : 'Set Override'}
                            </Button>
                            {athlete.source === 'manual' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteMutation.mutate(athlete.athlete_id)}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Secondary Bulk Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-4">
                <Button
                  onClick={() => bulkCopyMutation.mutate()}
                  disabled={bulkCopyMutation.isPending}
                  variant="outline"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy All to Manual
                </Button>
                <Button
                  onClick={() => openConfirmDialog('bulk_reset')}
                  disabled={isPending || metrics.manual_count === 0}
                  variant="outline"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset All to Auto
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {selectedMarket && !overrideData && !isLoadingOverrides && (
          <Alert>
            <AlertDescription>
              No data found for this market. Try regenerating odds first.
            </AlertDescription>
          </Alert>
        )}

        {/* Confirm Dialog */}
        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirmAction === 'clear_regenerate' 
                  ? 'Clear Overrides & Regenerate?' 
                  : 'Reset All Overrides?'}
              </DialogTitle>
              <DialogDescription>
                {confirmAction === 'clear_regenerate' ? (
                  <>
                    This will:
                    <ol className="list-decimal ml-4 mt-2 space-y-1">
                      <li>Delete all {metrics?.manual_count || 0} manual override(s)</li>
                      <li>Regenerate odds using the auto-calibration engine</li>
                      <li>Target implied sum of {metrics?.target_band_pct}</li>
                    </ol>
                    <p className="mt-2 text-sm">This action cannot be undone.</p>
                  </>
                ) : (
                  <>
                    This will remove all {metrics?.manual_count || 0} manual override(s) and revert to auto-generated multipliers.
                    This action cannot be undone.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} disabled={isPending}>
                Cancel
              </Button>
              <Button onClick={handleConfirmAction} disabled={isPending} variant="destructive">
                {isPending ? 'Processing...' : 'Confirm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Override Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingAthlete?.source === 'manual' ? 'Edit' : 'Set'} Multiplier Override
              </DialogTitle>
              <DialogDescription>
                {editingAthlete?.athlete_name} (Rank #{editingAthlete?.rank})
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Auto Multiplier</Label>
                <div className="text-lg font-mono text-muted-foreground">
                  {editingAthlete?.auto_multiplier.toFixed(2)}x
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="multiplier">Manual Override</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="multiplier"
                    type="number"
                    min={caps.min}
                    max={caps.max}
                    step={0.05}
                    value={editMultiplier}
                    onChange={(e) => setEditMultiplier(e.target.value)}
                    className="font-mono text-lg"
                    placeholder={`e.g. ${editingAthlete?.auto_multiplier.toFixed(2)}`}
                  />
                  <span className="text-muted-foreground">x</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Range: {caps.min}x – {caps.max}x
                </p>
                
                {getDeviationWarning() && (
                  <Alert variant={getDeviationWarning()?.isHigher ? 'default' : 'destructive'} className="mt-2">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      {getDeviationWarning()?.isHigher 
                        ? `Higher multiplier increases your exposure if this athlete wins.`
                        : `Lower multiplier reduces potential payout for users.`
                      }
                      <br />
                      <span className="font-mono">{getDeviationWarning()?.message}</span>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="reason">Reason (optional)</Label>
                <Textarea
                  id="reason"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g. Injured shoulder, new ski, weather conditions..."
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Recorded in audit log for your reference
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveOverride}
                disabled={upsertMutation.isPending}
              >
                {upsertMutation.isPending ? 'Saving...' : 'Save Override'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

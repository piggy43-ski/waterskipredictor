import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { 
  ChevronDown, ChevronUp, RefreshCw, Check, AlertTriangle, 
  Scale, Target, Send, Loader2, RotateCcw
} from 'lucide-react';
import type { Discipline } from '@/types';

interface AthleteOdds {
  athlete_id: string;
  athlete_name: string;
  world_rank: number | null;
  field_rank: number;
  rating: number;
  p_base: number;
  p_final: number;
  multiplier: number;
  source: 'auto' | 'manual';
  override_id?: string;
}

interface MarketData {
  id: string;
  name: string;
  market_type: string;
  discipline: Discipline;
  category: string;
  is_published: boolean;
  implied_sum: number | null;
  odds_validation_status: string | null;
}

interface ProbabilityReviewPanelProps {
  tournamentId: string;
  onPublish?: () => void;
}

const TARGET_IMPLIED_BANDS = {
  WINNER: { min: 0.90, max: 0.92, label: '90-92%' },
  PODIUM: { min: 0.84, max: 0.86, label: '84-86%' },
  HIGHEST_SCORE: { min: 0.87, max: 0.89, label: '87-89%' },
};

export function ProbabilityReviewPanel({ tournamentId, onPublish }: ProbabilityReviewPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [localOverrides, setLocalOverrides] = useState<Record<string, number>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  // Fetch markets for this tournament
  const { data: markets, isLoading: marketsLoading } = useQuery({
    queryKey: ['tournament-markets', tournamentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('id, name, market_type, discipline, category, is_published, odds_validation_status')
        .eq('tournament_id', tournamentId)
        .order('discipline')
        .order('category')
        .order('market_type');
      if (error) throw error;
      return (data || []).map(m => ({
        ...m,
        implied_sum: null // Will be calculated from odds
      })) as MarketData[];
    },
    enabled: !!tournamentId,
  });

  // Fetch odds for selected market - join with selections for multiplier
  const { data: marketOdds, isLoading: oddsLoading, refetch: refetchOdds } = useQuery({
    queryKey: ['market-odds-review', selectedMarketId],
    queryFn: async () => {
      // Fetch market_odds
      const { data: oddsData, error: oddsError } = await supabase
        .from('market_odds')
        .select(`
          athlete_id,
          base_probability,
          normalized_probability,
          prior_probability,
          final_decimal_odds,
          athlete_rank,
          athletes!inner(id, name)
        `)
        .eq('market_id', selectedMarketId!)
        .order('athlete_rank');
      if (oddsError) throw oddsError;
      
      // Fetch selections for multipliers
      const { data: selectionsData } = await supabase
        .from('selections')
        .select('athlete_id, decimal_odds')
        .eq('market_id', selectedMarketId!);
      
      const selectionsMap = new Map(selectionsData?.map(s => [s.athlete_id, s.decimal_odds]) || []);
      
      return oddsData?.map(d => ({
        athlete_id: d.athlete_id,
        athlete_name: (d.athletes as any).name,
        world_rank: d.athlete_rank,
        field_rank: d.athlete_rank || 0,
        rating: 70, // Default - not stored in market_odds
        p_base: d.prior_probability || d.base_probability || 0,
        p_final: d.normalized_probability || d.base_probability || 0,
        multiplier: selectionsMap.get(d.athlete_id) || d.final_decimal_odds || 1,
        source: 'auto' as const,
      })) as AthleteOdds[];
    },
    enabled: !!selectedMarketId,
  });

  // Fetch probability overrides
  const { data: overrides } = useQuery({
    queryKey: ['probability-overrides', selectedMarketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('market_probability_overrides')
        .select('id, athlete_id, manual_probability, is_enabled')
        .eq('market_id', selectedMarketId!)
        .eq('is_enabled', true);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedMarketId,
  });

  // Initialize local overrides from database
  useEffect(() => {
    if (marketOdds && overrides) {
      const initial: Record<string, number> = {};
      overrides.forEach(o => {
        if (o.manual_probability) {
          initial[o.athlete_id] = o.manual_probability;
        }
      });
      // Also include current probabilities for athletes without overrides
      marketOdds.forEach(odds => {
        if (!(odds.athlete_id in initial)) {
          initial[odds.athlete_id] = odds.p_final;
        }
      });
      setLocalOverrides(initial);
    }
  }, [marketOdds, overrides]);

  // Auto-select first market if none selected
  useEffect(() => {
    if (markets && markets.length > 0 && !selectedMarketId) {
      setSelectedMarketId(markets[0].id);
    }
  }, [markets, selectedMarketId]);

  // Calculate implied sum from local overrides
  const calculateImpliedSum = () => {
    if (!marketOdds) return 0;
    
    // Normalize local overrides
    const total = Object.values(localOverrides).reduce((s, v) => s + v, 0);
    if (total === 0) return 0;
    
    // Calculate implied sum based on multipliers derived from normalized probabilities
    // TODO(shadow): rename when touching this code
    // eslint-disable-next-line @typescript-eslint/no-shadow
    let impliedSum = 0;
    marketOdds.forEach(odds => {
      const rawProb = localOverrides[odds.athlete_id] || odds.p_final;
      const normalizedProb = rawProb / total;
      // Approximate multiplier (without full house edge calculation)
      const approxMultiplier = normalizedProb > 0 ? 1 / (normalizedProb * 0.91) : 20;
      impliedSum += 1 / approxMultiplier;
    });
    
    return impliedSum;
  };

  const selectedMarket = markets?.find(m => m.id === selectedMarketId);
  const impliedSum = calculateImpliedSum();
  const targetBand = selectedMarket 
    ? TARGET_IMPLIED_BANDS[selectedMarket.market_type as keyof typeof TARGET_IMPLIED_BANDS] 
    : TARGET_IMPLIED_BANDS.WINNER;

  const getImpliedSumStatus = () => {
    if (!targetBand) return { status: 'unknown', color: 'bg-muted' };
    if (impliedSum >= targetBand.min && impliedSum <= targetBand.max) {
      return { status: 'OK', color: 'bg-green-500' };
    }
    if (impliedSum < targetBand.min - 0.05 || impliedSum > targetBand.max + 0.05) {
      return { status: 'BLOCKED', color: 'bg-destructive' };
    }
    return { status: 'WARNING', color: 'bg-yellow-500' };
  };

  const sumStatus = getImpliedSumStatus();

  // Save override mutation
  const saveOverrideMutation = useMutation({
    mutationFn: async ({ athleteId, probability }: { athleteId: string; probability: number }) => {
      const { data, error } = await supabase.functions.invoke('manage-probability-overrides', {
        body: {
          action: 'upsert',
          market_id: selectedMarketId,
          athlete_id: athleteId,
          manual_probability: probability,
          reason: 'Adjusted via review panel'
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['probability-overrides', selectedMarketId] });
      toast.success('Override saved');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`);
    }
  });

  // Auto-normalize mutation
  const normalizeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-probability-overrides', {
        body: {
          action: 'bulk_normalize',
          market_id: selectedMarketId
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['probability-overrides', selectedMarketId] });
      queryClient.invalidateQueries({ queryKey: ['market-odds-review', selectedMarketId] });
      toast.success('Probabilities normalized');
    }
  });

  // Reset all overrides
  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-probability-overrides', {
        body: {
          action: 'bulk_reset',
          market_id: selectedMarketId
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['probability-overrides', selectedMarketId] });
      queryClient.invalidateQueries({ queryKey: ['market-odds-review', selectedMarketId] });
      setLocalOverrides({});
      toast.success('Reset to auto-calculated');
    }
  });

  // Regenerate odds
  const regenerateOdds = async () => {
    if (!selectedMarketId) return;
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-market-odds', {
        body: { market_id: selectedMarketId, force: true, debug: true }
      });
      if (error) throw error;
      await refetchOdds();
      queryClient.invalidateQueries({ queryKey: ['tournament-markets', tournamentId] });
      toast.success(`Odds regenerated. Implied sum: ${(data.implied_sum * 100).toFixed(1)}%`);
    } catch (error) {
      toast.error(`Failed: ${(error as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Publish all markets
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!markets) return;
      
      // First regenerate all markets to apply any pending overrides
      for (const market of markets) {
        await supabase.functions.invoke('generate-market-odds', {
          body: { market_id: market.id, force: true }
        });
      }
      
      // Then mark all as published
      const { error } = await supabase
        .from('markets')
        .update({ is_published: true, published_at: new Date().toISOString() })
        .eq('tournament_id', tournamentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournament-markets', tournamentId] });
      toast.success('All markets published and odds finalized!');
      onPublish?.();
    },
    onError: (error: Error) => {
      toast.error(`Failed to publish: ${error.message}`);
    }
  });

  const handleProbabilityChange = (athleteId: string, value: number) => {
    setLocalOverrides(prev => ({ ...prev, [athleteId]: value }));
  };

  const handleProbabilitySave = (athleteId: string) => {
    const prob = localOverrides[athleteId];
    if (prob !== undefined) {
      saveOverrideMutation.mutate({ athleteId, probability: prob });
    }
  };

  // Check if all markets are valid
  const allMarketsValid = markets?.every(m => m.odds_validation_status === 'VALID' || !m.odds_validation_status);
  const anyPublished = markets?.some(m => m.is_published);

  if (marketsLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!markets || markets.length === 0) {
    return null; // No markets yet - nothing to review
  }

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Scale className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">Review Probabilities</CardTitle>
                  <CardDescription>
                    Adjust athlete probabilities before publishing
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {anyPublished && (
                  <Badge variant="secondary" className="bg-green-500/20 text-green-700">
                    Published
                  </Badge>
                )}
                {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Market Selector Tabs */}
            <div className="space-y-2">
              <Label>Select Market</Label>
              <Tabs 
                value={selectedMarketId || ''} 
                onValueChange={setSelectedMarketId}
                className="w-full"
              >
                <TabsList className="flex flex-wrap h-auto gap-1">
                  {markets.map(market => (
                    <TabsTrigger 
                      key={market.id} 
                      value={market.id}
                      className="text-xs px-2 py-1"
                    >
                      {market.discipline.charAt(0).toUpperCase()}{market.discipline.slice(1)}{' '}
                      {market.category === 'open_men' ? 'M' : 'W'}{' '}
                      {market.market_type}
                      {market.is_published && <Check className="h-3 w-3 ml-1 text-green-500" />}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            {/* Status Bar */}
            {selectedMarket && (
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <Target className="h-4 w-4 text-muted-foreground" />
                  <div className="text-xs">
                    <div className="text-muted-foreground">Target</div>
                    <div className="font-medium">{targetBand.label}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <div className={`h-3 w-3 rounded-full ${sumStatus.color}`} />
                  <div className="text-xs">
                    <div className="text-muted-foreground">Implied Sum</div>
                    <div className="font-medium">{(impliedSum * 100).toFixed(1)}%</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <div className="text-xs">
                    <div className="text-muted-foreground">Status</div>
                    <div className="font-medium">{sumStatus.status}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Athlete Probability Table */}
            {selectedMarketId && (
              <div className="border rounded-lg">
                <div className="grid grid-cols-[1fr,80px,80px,120px,80px,60px] gap-2 p-2 bg-muted text-xs font-medium">
                  <div>Athlete</div>
                  <div className="text-center">Rank</div>
                  <div className="text-center">Auto %</div>
                  <div className="text-center">Adjusted</div>
                  <div className="text-center">Mult</div>
                  <div></div>
                </div>
                
                <div className="divide-y max-h-80 overflow-y-auto">
                  {oddsLoading ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                      Loading...
                    </div>
                  ) : marketOdds?.map(odds => {
                    const localProb = localOverrides[odds.athlete_id] ?? odds.p_final;
                    const hasOverride = overrides?.some(o => o.athlete_id === odds.athlete_id);
                    const isDirty = localOverrides[odds.athlete_id] !== undefined && 
                                    localOverrides[odds.athlete_id] !== odds.p_final;
                    
                    // Approximate multiplier from local probability
                    const total = Object.values(localOverrides).reduce((s, v) => s + v, 0);
                    const normalizedProb = total > 0 ? localProb / total : localProb;
                    const approxMult = normalizedProb > 0 ? (1 / (normalizedProb * 0.91)).toFixed(2) : '-';
                    
                    return (
                      <div 
                        key={odds.athlete_id}
                        className="grid grid-cols-[1fr,80px,80px,120px,80px,60px] gap-2 p-2 items-center text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{odds.athlete_name}</span>
                          {hasOverride && (
                            <Badge variant="outline" className="text-xs py-0 px-1">M</Badge>
                          )}
                        </div>
                        <div className="text-center text-muted-foreground">
                          #{odds.world_rank || odds.field_rank || '-'}
                        </div>
                        <div className="text-center text-muted-foreground">
                          {(odds.p_base * 100).toFixed(1)}%
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="0.99"
                            value={(localProb * 100).toFixed(1)}
                            onChange={(e) => handleProbabilityChange(
                              odds.athlete_id, 
                              parseFloat(e.target.value) / 100
                            )}
                            className="h-7 text-xs w-16"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                        <div className="text-center font-mono">
                          {approxMult}x
                        </div>
                        <div>
                          {isDirty && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => handleProbabilitySave(odds.athlete_id)}
                              disabled={saveOverrideMutation.isPending}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => normalizeMutation.mutate()}
                disabled={normalizeMutation.isPending}
              >
                <Scale className="h-4 w-4 mr-1" />
                Auto-Normalize
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => resetMutation.mutate()}
                disabled={resetMutation.isPending}
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset to Auto
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={regenerateOdds}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Regenerate Odds
              </Button>
              
              <div className="flex-1" />
              
              <Button
                onClick={() => publishMutation.mutate()}
                disabled={publishMutation.isPending || !allMarketsValid}
                className="bg-green-600 hover:bg-green-700"
              >
                {publishMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-1" />
                )}
                Publish All Markets
              </Button>
            </div>

            {!allMarketsValid && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Some markets have validation errors. Fix them before publishing.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

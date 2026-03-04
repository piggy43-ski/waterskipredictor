import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { 
  ChevronDown, ChevronUp, RefreshCw, Check, AlertTriangle, 
  Scale, Target, Send, Loader2, RotateCcw, Lock, Unlock, Save
} from 'lucide-react';
import type { Discipline } from '@/types';

interface AthleteProb {
  athlete_id: string;
  athlete_name: string;
  field_rank: number;
  world_rank: number | null;
  p_winner: number;
  p_winner_auto: number;
  multiplier: number;
  p_podium: number;
  p_highest: number;
  is_winner_manual: boolean;
  is_podium_locked: boolean;
  is_highest_locked: boolean;
}

interface MarketGroup {
  discipline: Discipline;
  category: 'open_men' | 'open_women';
  winner_market_id: string;
  podium_market_id: string | null;
  highest_market_id: string | null;
  athletes: AthleteProb[];
  implied_sum: number;
  status: 'OK' | 'WARNING' | 'BLOCKED';
}

interface ProbabilityEditorProps {
  tournamentId: string;
  onPublish?: () => void;
}

const TARGET_BAND = { min: 0.90, max: 0.92 };

// Cascade formulas from pricing engine
function calculatePodiumProb(pWinner: number): number {
  return Math.min(0.90, Math.max(0.05, 1 - Math.pow(1 - pWinner, 2.2)));
}

function calculateHighestProb(pWinner: number): number {
  return Math.min(0.50, Math.max(0.01, Math.pow(pWinner, 0.85)));
}

function calculateMultiplier(prob: number, edgeFactor: number = 0.91): number {
  if (prob <= 0) return 20;
  const mult = 1 / (prob * edgeFactor);
  return Math.min(25, Math.max(1.5, mult));
}

export function ProbabilityEditor({ tournamentId, onPublish }: ProbabilityEditorProps) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [localProbs, setLocalProbs] = useState<Record<string, Record<string, number>>>({});
  const [lockedPodium, setLockedPodium] = useState<Set<string>>(new Set());
  const [lockedHighest, setLockedHighest] = useState<Set<string>>(new Set());
  const [savingMarket, setSavingMarket] = useState<string | null>(null);
  const [publishingAll, setPublishingAll] = useState(false);
  const queryClient = useQueryClient();

  // Fetch all markets for this tournament
  const { data: markets, isLoading: marketsLoading } = useQuery({
    queryKey: ['tournament-markets-prob', tournamentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('id, name, market_type, discipline, category, is_published')
        .eq('tournament_id', tournamentId)
        .order('discipline')
        .order('category');
      if (error) throw error;
      return data;
    },
    enabled: !!tournamentId,
  });

  // Fetch all odds across markets
  const { data: allOdds, isLoading: oddsLoading, refetch: refetchOdds } = useQuery({
    queryKey: ['all-market-odds-prob', tournamentId],
    queryFn: async () => {
      if (!markets) return [];
      const marketIds = markets.map(m => m.id);
      
      const { data: oddsData, error } = await supabase
        .from('market_odds')
        .select(`
          market_id,
          athlete_id,
          normalized_probability,
          blended_probability,
          athlete_rank,
          final_decimal_odds,
          athletes!inner(id, name, current_rank_slalom, current_rank_trick, current_rank_jump)
        `)
        .in('market_id', marketIds)
        .order('athlete_rank');
      if (error) throw error;
      return oddsData as any[];
    },
    enabled: !!markets && markets.length > 0,
  });

  // Fetch all selections for multipliers
  const { data: allSelections } = useQuery({
    queryKey: ['all-selections-prob', tournamentId],
    queryFn: async () => {
      if (!markets) return [];
      const marketIds = markets.map(m => m.id);
      
      const { data, error } = await supabase
        .from('selections')
        .select('market_id, athlete_id, decimal_odds')
        .in('market_id', marketIds);
      if (error) throw error;
      return data;
    },
    enabled: !!markets && markets.length > 0,
  });

  // Fetch probability overrides
  const { data: allOverrides } = useQuery({
    queryKey: ['all-prob-overrides', tournamentId],
    queryFn: async () => {
      if (!markets) return [];
      const marketIds = markets.map(m => m.id);
      
      const { data, error } = await supabase
        .from('market_probability_overrides')
        .select('market_id, athlete_id, manual_probability, is_enabled, is_cascaded')
        .in('market_id', marketIds)
        .eq('is_enabled', true);
      if (error) throw error;
      return data;
    },
    enabled: !!markets && markets.length > 0,
  });

  // Group markets by discipline + category
  const marketGroups = useMemo(() => {
    if (!markets || !allOdds) return [];

    const groups: MarketGroup[] = [];
    const disciplines: Discipline[] = ['slalom', 'trick', 'jump'];
    const categories = ['open_men', 'open_women'] as const;

    for (const discipline of disciplines) {
      for (const category of categories) {
        const winnerMarket = markets.find(m => 
          m.discipline === discipline && 
          m.category === category && 
          m.market_type === 'WINNER'
        );
        
        if (!winnerMarket) continue;

        const podiumMarket = markets.find(m => 
          m.discipline === discipline && 
          m.category === category && 
          m.market_type === 'PODIUM'
        );
        
        const highestMarket = markets.find(m => 
          m.discipline === discipline && 
          m.category === category && 
          m.market_type === 'HIGHEST_SCORE'
        );

        // Get athletes from winner market odds
        const winnerOdds = allOdds.filter(o => o.market_id === winnerMarket.id);
        const selectionsMap = new Map(
          allSelections?.filter(s => s.market_id === winnerMarket.id)
            .map(s => [s.athlete_id, s.decimal_odds]) || []
        );
        
        // Get overrides for winner market
        const winnerOverrides = new Map(
          allOverrides?.filter(o => o.market_id === winnerMarket.id)
            .map(o => [o.athlete_id, o.manual_probability]) || []
        );

        const athletes: AthleteProb[] = winnerOdds.map(o => {
          const athlete = o.athletes as any;
          const p_auto = o.blended_probability || o.normalized_probability || 0;
          const p_manual = winnerOverrides.get(o.athlete_id);
          const p_winner = p_manual ?? p_auto;
          const calibratedOdds = o.final_decimal_odds;
          const multiplier = calibratedOdds || selectionsMap.get(o.athlete_id) || calculateMultiplier(p_winner);
          
          const rankField = `current_rank_${discipline}` as keyof typeof athlete;
          
          return {
            athlete_id: o.athlete_id,
            athlete_name: athlete.name,
            field_rank: o.athlete_rank || 0,
            world_rank: athlete[rankField] || null,
            p_winner,
            p_winner_auto: p_auto,
            multiplier,
            p_podium: calculatePodiumProb(p_winner),
            p_highest: calculateHighestProb(p_winner),
            is_winner_manual: p_manual !== undefined,
            is_podium_locked: false,
            is_highest_locked: false,
          };
        });

        // Calculate implied sum
        const impliedSum = athletes.reduce((sum, a) => {
          const mult = calculateMultiplier(a.p_winner);
          return sum + (1 / mult);
        }, 0);

        let status: 'OK' | 'WARNING' | 'BLOCKED' = 'OK';
        if (impliedSum < TARGET_BAND.min - 0.03 || impliedSum > TARGET_BAND.max + 0.03) {
          status = 'BLOCKED';
        } else if (impliedSum < TARGET_BAND.min || impliedSum > TARGET_BAND.max) {
          status = 'WARNING';
        }

        groups.push({
          discipline,
          category,
          winner_market_id: winnerMarket.id,
          podium_market_id: podiumMarket?.id || null,
          highest_market_id: highestMarket?.id || null,
          athletes,
          implied_sum: impliedSum,
          status,
        });
      }
    }

    return groups;
  }, [markets, allOdds, allSelections, allOverrides]);

  // Initialize local probs from groups
  useEffect(() => {
    if (marketGroups.length > 0 && Object.keys(localProbs).length === 0) {
      const initial: Record<string, Record<string, number>> = {};
      const allKeys = new Set<string>();
      marketGroups.forEach(group => {
        const key = `${group.discipline}-${group.category}`;
        initial[key] = {};
        allKeys.add(key);
        group.athletes.forEach(a => {
          initial[key][a.athlete_id] = a.p_winner;
        });
      });
      setLocalProbs(initial);
      // Open ALL groups by default so nothing is hidden
      setOpenGroups(allKeys);
    }
  }, [marketGroups, localProbs]);

  const toggleGroup = (key: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleProbChange = (groupKey: string, athleteId: string, value: string) => {
    const numValue = parseFloat(value) / 100;
    if (isNaN(numValue) || numValue < 0.01 || numValue > 0.99) return;
    
    setLocalProbs(prev => ({
      ...prev,
      [groupKey]: {
        ...prev[groupKey],
        [athleteId]: numValue,
      },
    }));
  };

  // Calculate local implied sum for a group
  const getLocalImpliedSum = (groupKey: string, group: MarketGroup) => {
    const probs = localProbs[groupKey] || {};
    let sum = 0;
    group.athletes.forEach(a => {
      const p = probs[a.athlete_id] ?? a.p_winner;
      sum += 1 / calculateMultiplier(p);
    });
    return sum;
  };

  const getLocalStatus = (impliedSum: number): 'OK' | 'WARNING' | 'BLOCKED' => {
    if (impliedSum < TARGET_BAND.min - 0.03 || impliedSum > TARGET_BAND.max + 0.03) {
      return 'BLOCKED';
    }
    if (impliedSum < TARGET_BAND.min || impliedSum > TARGET_BAND.max) {
      return 'WARNING';
    }
    return 'OK';
  };

  // Save and cascade probabilities
  const saveGroupMutation = useMutation({
    mutationFn: async ({ group, groupKey }: { group: MarketGroup; groupKey: string }) => {
      const probs = localProbs[groupKey] || {};
      
      // First normalize probabilities
      const total = Object.values(probs).reduce((s, v) => s + v, 0);
      const normalized: Record<string, number> = {};
      Object.entries(probs).forEach(([id, p]) => {
        normalized[id] = total > 0 ? p / total : p;
      });
      
      // Save to WINNER market
      for (const [athleteId, prob] of Object.entries(normalized)) {
        await supabase.functions.invoke('manage-probability-overrides', {
          body: {
            action: 'upsert',
            market_id: group.winner_market_id,
            athlete_id: athleteId,
            manual_probability: prob,
            reason: 'Edited in Probability Editor'
          }
        });
      }
      
      // Cascade to PODIUM and HIGHEST_SCORE
      if (group.podium_market_id || group.highest_market_id) {
        await supabase.functions.invoke('manage-probability-overrides', {
          body: {
            action: 'cascade_from_winner',
            winner_market_id: group.winner_market_id,
            podium_market_id: group.podium_market_id,
            highest_market_id: group.highest_market_id,
          }
        });
      }
      
      // Regenerate odds for all markets
      await supabase.functions.invoke('generate-market-odds', {
        body: { market_id: group.winner_market_id, force: true }
      });
      
      if (group.podium_market_id) {
        await supabase.functions.invoke('generate-market-odds', {
          body: { market_id: group.podium_market_id, force: true }
        });
      }
      
      if (group.highest_market_id) {
        await supabase.functions.invoke('generate-market-odds', {
          body: { market_id: group.highest_market_id, force: true }
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-market-odds-prob', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['all-prob-overrides', tournamentId] });
      queryClient.invalidateQueries({ queryKey: ['all-selections-prob', tournamentId] });
      toast.success('Probabilities saved and cascaded to all markets');
    },
    onError: (error: Error) => {
      toast.error(`Failed to save: ${error.message}`);
    },
  });

  // Auto-normalize a group
  const normalizeGroup = (groupKey: string, group: MarketGroup) => {
    const probs = localProbs[groupKey] || {};
    const total = Object.values(probs).reduce((s, v) => s + v, 0);
    if (total === 0) return;
    
    const normalized: Record<string, number> = {};
    Object.entries(probs).forEach(([id, p]) => {
      normalized[id] = p / total;
    });
    
    setLocalProbs(prev => ({
      ...prev,
      [groupKey]: normalized,
    }));
    toast.success('Probabilities normalized to 100%');
  };

  // Reset to auto-calculated
  const resetGroup = (groupKey: string, group: MarketGroup) => {
    const autoProbs: Record<string, number> = {};
    group.athletes.forEach(a => {
      autoProbs[a.athlete_id] = a.p_winner_auto;
    });
    setLocalProbs(prev => ({
      ...prev,
      [groupKey]: autoProbs,
    }));
    toast.success('Reset to auto-calculated probabilities');
  };

  // Publish all markets
  const publishAll = async () => {
    setPublishingAll(true);
    try {
      // First save all groups
      for (const group of marketGroups) {
        const groupKey = `${group.discipline}-${group.category}`;
        await saveGroupMutation.mutateAsync({ group, groupKey });
      }
      
      // Then mark all as published
      const { error } = await supabase
        .from('markets')
        .update({ is_published: true, published_at: new Date().toISOString() })
        .eq('tournament_id', tournamentId);
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['tournament-markets-prob', tournamentId] });
      toast.success('All markets published!');
      onPublish?.();
    } catch (error) {
      toast.error(`Failed to publish: ${(error as Error).message}`);
    } finally {
      setPublishingAll(false);
    }
  };

  const anyPublished = markets?.some(m => m.is_published);
  const allValid = marketGroups.every(g => getLocalStatus(getLocalImpliedSum(`${g.discipline}-${g.category}`, g)) !== 'BLOCKED');

  if (marketsLoading || oddsLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!markets || markets.length === 0 || marketGroups.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scale className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Probability Editor</CardTitle>
              <p className="text-sm text-muted-foreground">
                Edit WINNER probabilities - automatically cascades to PODIUM & HIGHEST SCORE
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {anyPublished && (
              <Badge variant="secondary" className="bg-green-500/20 text-green-700">
                Published
              </Badge>
            )}
            <Button
              onClick={publishAll}
              disabled={publishingAll || !allValid}
              className="bg-green-600 hover:bg-green-700"
            >
              {publishingAll ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              Publish All
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {marketGroups.map(group => {
          const groupKey = `${group.discipline}-${group.category}`;
          const isOpen = openGroups.has(groupKey);
          const localSum = getLocalImpliedSum(groupKey, group);
          const localStatus = getLocalStatus(localSum);
          const probs = localProbs[groupKey] || {};

          return (
            <Collapsible 
              key={groupKey} 
              open={isOpen} 
              onOpenChange={() => toggleGroup(groupKey)}
            >
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    <span className="font-medium capitalize">
                      {group.discipline} - {group.category === 'open_men' ? 'Men' : 'Women'}
                    </span>
                    <Badge variant="outline">{group.athletes.length} athletes</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">90-92%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`h-3 w-3 rounded-full ${
                        localStatus === 'OK' ? 'bg-green-500' : 
                        localStatus === 'WARNING' ? 'bg-yellow-500' : 'bg-destructive'
                      }`} />
                      <span className="text-sm font-mono">{(localSum * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div className="mt-2 border rounded-lg">
                  {/* Header */}
                  <div className="grid grid-cols-[1fr,60px,100px,80px,80px,80px] gap-2 p-3 bg-muted text-xs font-medium border-b">
                    <div>Athlete</div>
                    <div className="text-center">Rank</div>
                    <div className="text-center">WINNER %</div>
                    <div className="text-center">Mult</div>
                    <div className="text-center">PODIUM %</div>
                    <div className="text-center">HIGH %</div>
                  </div>
                  
                  {/* Athletes */}
                  <div className="divide-y max-h-80 overflow-y-auto">
                    {group.athletes.map(athlete => {
                      const localP = probs[athlete.athlete_id] ?? athlete.p_winner;
                      const localMult = calculateMultiplier(localP);
                      const localPodium = calculatePodiumProb(localP);
                      const localHighest = calculateHighestProb(localP);
                      const isDirty = probs[athlete.athlete_id] !== undefined && 
                                      probs[athlete.athlete_id] !== athlete.p_winner;

                      return (
                        <div 
                          key={athlete.athlete_id}
                          className="grid grid-cols-[1fr,60px,100px,80px,80px,80px] gap-2 p-3 items-center text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{athlete.athlete_name}</span>
                            {athlete.is_winner_manual && (
                              <Badge variant="outline" className="text-xs py-0 px-1">M</Badge>
                            )}
                          </div>
                          <div className="text-center text-muted-foreground">
                            #{athlete.world_rank || athlete.field_rank || '-'}
                          </div>
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              step="0.1"
                              min="1"
                              max="99"
                              value={(localP * 100).toFixed(1)}
                              onChange={(e) => handleProbChange(groupKey, athlete.athlete_id, e.target.value)}
                              className={`h-7 text-xs w-16 text-center ${isDirty ? 'border-primary' : ''}`}
                            />
                          </div>
                          <div className="text-center font-mono text-muted-foreground">
                            {localMult.toFixed(2)}x
                          </div>
                          <div className="text-center text-muted-foreground">
                            {(localPodium * 100).toFixed(1)}%
                          </div>
                          <div className="text-center text-muted-foreground">
                            {(localHighest * 100).toFixed(1)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 p-3 border-t bg-muted/50">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => normalizeGroup(groupKey, group)}
                    >
                      <Scale className="h-4 w-4 mr-1" />
                      Normalize
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => resetGroup(groupKey, group)}
                    >
                      <RotateCcw className="h-4 w-4 mr-1" />
                      Reset
                    </Button>
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      onClick={() => {
                        setSavingMarket(groupKey);
                        saveGroupMutation.mutate(
                          { group, groupKey },
                          { onSettled: () => setSavingMarket(null) }
                        );
                      }}
                      disabled={savingMarket === groupKey || saveGroupMutation.isPending}
                    >
                      {savingMarket === groupKey ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-1" />
                      )}
                      Save & Apply
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {!allValid && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span className="text-sm">
              Some groups have implied sums outside the valid range. Adjust probabilities before publishing.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

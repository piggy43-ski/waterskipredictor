import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, ExternalLink, TrendingUp, Trophy, Target } from 'lucide-react';
import { calculatePerformanceIndex, calculateFantasyPrice } from '@/utils/athleteCalculations';
import { probabilityToMultiplier, formatMultiplier } from '@/utils/multiplierUtils';
import type { AthleteResult } from '@/utils/athleteCalculations';
import type { TierLevel } from '@/utils/athleteTiers';

export default function AthleteDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: athlete, isLoading } = useQuery({
    queryKey: ['athlete-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  const { data: recentResults } = useQuery({
    queryKey: ['athlete-results', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_results')
        .select(`
          *,
          tournament:tournaments(name)
        `)
        .eq('athlete_id', id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const recalculateMutation = useMutation({
    mutationFn: async (discipline: 'slalom' | 'trick' | 'jump') => {
      if (!athlete) return;

      // Get recent results for this discipline
      const { data: results } = await supabase
        .from('athlete_results')
        .select('*')
        .eq('athlete_id', id)
        .eq('discipline', discipline)
        .order('created_at', { ascending: false })
        .limit(3);

      const athleteResults: AthleteResult[] = (results || []).map(r => ({
        position: r.position,
        made_finals: r.made_finals,
        missed_first_pass: r.missed_first_pass,
        missed_gate: r.missed_gate,
      }));

      const performanceIndex = calculatePerformanceIndex({
        current_rank: athlete[`current_rank_${discipline}`] || null,
        recent_results: athleteResults,
        popularity_index: athlete.popularity_index || 0,
        manual_boost_factor: athlete.manual_boost_factor || 1.0,
        injury_flag: athlete.injury_flag || false,
      });

      const fantasyPrice = calculateFantasyPrice(performanceIndex, athlete.popularity_index || 0);

      const { error } = await supabase
        .from('athletes')
        .update({
          [`performance_index_${discipline}`]: performanceIndex,
          [`fantasy_price_${discipline}`]: fantasyPrice,
        })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['athlete-detail', id] });
      toast({ title: 'Performance recalculated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Recalculation failed', description: error.message, variant: 'destructive' });
    },
  });

  const updateAthleteField = async (field: string, value: unknown) => {
    const { error } = await supabase
      .from('athletes')
      .update({ [field]: value })
      .eq('id', id);

    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      queryClient.invalidateQueries({ queryKey: ['athlete-detail', id] });
      toast({ title: 'Updated successfully' });
    }
  };

  const getTierBadgeVariant = (tier: string | null) => {
    switch (tier) {
      case 'tier1': return 'default';
      case 'tier2': return 'secondary';
      case 'tier3': return 'outline';
      default: return 'outline';
    }
  };

  const getTierLabel = (tier: string | null) => {
    switch (tier) {
      case 'tier1': return 'Tier 1 (Elite)';
      case 'tier2': return 'Tier 2';
      case 'tier3': return 'Tier 3';
      default: return 'Unranked';
    }
  };

  // Calculate implied probability and multiplier from strength score
  const getImpliedMultiplier = (strengthScore: number | null) => {
    if (!strengthScore || strengthScore <= 0) return { probability: 0, multiplier: '99.99x' };
    // Assume a typical field strength of 1.0 total for display purposes
    const probability = Math.min(0.9, Math.max(0.02, strengthScore));
    const multiplier = probabilityToMultiplier(probability, 0.10);
    return { probability, multiplier: formatMultiplier(multiplier) };
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="p-6">Loading...</div>
      </AdminLayout>
    );
  }

  if (!athlete) {
    return (
      <AdminLayout>
        <div className="p-6">Athlete not found</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link to="/admin/athletes">
            <Button variant="outline" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-foreground">{athlete.full_name || athlete.name}</h2>
            <p className="text-muted-foreground mt-1">
              {athlete.country_code || athlete.country} • {athlete.gender}
            </p>
          </div>
          <Link to={`/athletes/${id}`} target="_blank">
            <Button variant="outline">
              <ExternalLink className="w-4 h-4 mr-2" />
              View Public Profile
            </Button>
          </Link>
        </div>

        {/* Discipline Cards with new stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['slalom', 'trick', 'jump'] as const).map((discipline) => {
            const tier = athlete[`strength_tier_${discipline}`] as string | null;
            const strengthScore = athlete[`odds_strength_score_${discipline}`] as number | null;
            const { probability, multiplier } = getImpliedMultiplier(strengthScore);
            const seasonEvents = (athlete[`season_events_${discipline}`] as number) || 0;
            const seasonPodiums = (athlete[`season_podiums_${discipline}`] as number) || 0;
            const careerPodiums = (athlete[`career_podiums_${discipline}`] as number) || 0;
            const careerEvents = (athlete[`career_events_${discipline}`] as number) || 0;

            return (
              <Card key={discipline}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="capitalize">{discipline}</CardTitle>
                    <Badge variant={getTierBadgeVariant(tier)}>
                      {getTierLabel(tier)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* World Rank & Points */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">World Rank</p>
                      <p className="text-xl font-bold">
                        {athlete[`current_rank_${discipline}`] || 'N/A'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Points</p>
                      <p className="text-lg font-semibold">
                        {athlete[`current_points_${discipline}`]?.toFixed(1) || 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Probability Engine Stats */}
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <TrendingUp className="w-4 h-4" />
                      Probability Engine
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Strength Score</p>
                        <p className="text-lg font-bold text-primary">
                          {strengthScore?.toFixed(3) || '0.000'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Multiplier</p>
                        <p className="text-lg font-bold text-accent">
                          {multiplier}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Win Probability</p>
                      <p className="text-sm font-medium">
                        {(probability * 100).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* Season/Career Stats */}
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <Trophy className="w-4 h-4" />
                      Stats
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Season</p>
                        <p className="font-medium">
                          {seasonPodiums}/{seasonEvents} podiums
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ({seasonEvents > 0 ? ((seasonPodiums / seasonEvents) * 100).toFixed(0) : 0}% rate)
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Career</p>
                        <p className="font-medium">
                          {careerPodiums}/{careerEvents} podiums
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ({careerEvents > 0 ? ((careerPodiums / careerEvents) * 100).toFixed(0) : 0}% rate)
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Fantasy Price */}
                  <div className="bg-muted/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                      <Target className="w-4 h-4" />
                      Fantasy
                    </div>
                    <p className="text-2xl font-bold text-primary">
                      {(athlete[`fantasy_price_${discipline}`] || 0).toLocaleString()} tokens
                    </p>
                  </div>

                  {/* Tier Selection */}
                  <div>
                    <Label className="text-xs">Strength Tier</Label>
                    <Select
                      value={tier || 'unranked'}
                      onValueChange={(value) => updateAthleteField(`strength_tier_${discipline}`, value)}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tier1">Tier 1 (Elite)</SelectItem>
                        <SelectItem value="tier2">Tier 2</SelectItem>
                        <SelectItem value="tier3">Tier 3</SelectItem>
                        <SelectItem value="unranked">Unranked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => recalculateMutation.mutate(discipline)}
                    disabled={recalculateMutation.isPending}
                  >
                    <RefreshCw className="w-3 h-3 mr-2" />
                    Recalculate
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Manual Adjustments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="boost">Manual Boost Factor</Label>
                <Input
                  id="boost"
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="2.0"
                  value={athlete.manual_boost_factor || 1.0}
                  onChange={(e) => updateAthleteField('manual_boost_factor', parseFloat(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="popularity">Popularity Index</Label>
                <Input
                  id="popularity"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={athlete.popularity_index || 0}
                  onChange={(e) => updateAthleteField('popularity_index', parseFloat(e.target.value))}
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="injury"
                checked={athlete.injury_flag || false}
                onCheckedChange={(checked) => updateAthleteField('injury_flag', checked)}
              />
              <Label htmlFor="injury">Injury Flag (applies 30% penalty)</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Results</CardTitle>
          </CardHeader>
          <CardContent>
            {recentResults && recentResults.length > 0 ? (
              <div className="space-y-2">
                {recentResults.map((result: any) => (
                  <div key={result.id} className="flex items-center justify-between border-b pb-2">
                    <div>
                      <p className="font-semibold">{result.tournament?.name}</p>
                      <p className="text-sm text-muted-foreground capitalize">{result.discipline}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">
                        {result.position ? `#${result.position}` : 'DNS'}
                      </p>
                      <div className="flex gap-1 text-xs">
                        {result.made_finals && <span className="text-green-600">Finals</span>}
                        {result.missed_first_pass && <span className="text-red-600">DNQ</span>}
                        {result.missed_gate && <span className="text-yellow-600">Gate</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No recent results</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

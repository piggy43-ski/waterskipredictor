import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, ExternalLink } from 'lucide-react';
import { calculatePerformanceIndex, calculateFantasyPrice } from '@/utils/athleteCalculations';
import type { AthleteResult } from '@/utils/athleteCalculations';

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

  const updateAthleteField = async (field: string, value: any) => {
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['slalom', 'trick', 'jump'] as const).map((discipline) => (
            <Card key={discipline}>
              <CardHeader>
                <CardTitle className="capitalize">{discipline}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">World Rank</p>
                  <p className="text-2xl font-bold">
                    {athlete[`current_rank_${discipline}`] || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Points</p>
                  <p className="text-xl font-semibold">
                    {athlete[`current_points_${discipline}`]?.toFixed(2) || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Performance Index</p>
                  <p className="text-xl font-semibold text-primary">
                    {(athlete[`performance_index_${discipline}`] || 0).toFixed(3)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fantasy Price</p>
                  <p className="text-xl font-semibold text-accent">
                    {athlete[`fantasy_price_${discipline}`] || 0} tokens
                  </p>
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
          ))}
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

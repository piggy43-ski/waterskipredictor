import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function AthleteProfile() {
  const { id } = useParams<{ id: string }>();

  const { data: athlete, isLoading } = useQuery({
    queryKey: ['athlete-profile', id],
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

  const { data: recentResult } = useQuery({
    queryKey: ['athlete-last-result', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_results')
        .select(`
          *,
          tournament:tournaments(name, location)
        `)
        .eq('athlete_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">Loading...</div>
      </div>
    );
  }

  if (!athlete) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-muted-foreground">Athlete not found</p>
        </div>
      </div>
    );
  }

  const disciplines = athlete.disciplines || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <Link to="/tournaments">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </Link>

        <div className="flex items-start gap-6">
          {athlete.profile_image_url ? (
            <img
              src={athlete.profile_image_url}
              alt={athlete.full_name || athlete.name}
              className="w-32 h-32 rounded-full object-cover"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-secondary flex items-center justify-center text-4xl font-bold">
              {(athlete.full_name || athlete.name).charAt(0)}
            </div>
          )}
          
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-foreground">{athlete.full_name || athlete.name}</h1>
            <p className="text-xl text-muted-foreground mt-1">
              {athlete.country_code || athlete.country}
            </p>
            <div className="flex gap-2 mt-3">
              {disciplines.map((d: string) => (
                <span key={d} className="px-3 py-1 bg-primary/10 text-primary rounded-full text-sm capitalize">
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>

        {athlete.bio && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground">{athlete.bio}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {disciplines.map((discipline: string) => {
            const rank = athlete[`current_rank_${discipline}`];
            const points = athlete[`current_points_${discipline}`];
            const perfIndex = athlete[`performance_index_${discipline}`] || 0;
            const fantasyPrice = athlete[`fantasy_price_${discipline}`] || 0;

            return (
              <Card key={discipline}>
                <CardHeader>
                  <CardTitle className="capitalize text-lg">{discipline}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground">World Rank</p>
                    <p className="text-3xl font-bold text-primary">
                      {rank || 'N/A'}
                    </p>
                  </div>
                  
                  {points && (
                    <div>
                      <p className="text-sm text-muted-foreground">Points</p>
                      <p className="text-xl font-semibold">{points.toFixed(2)}</p>
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Performance</p>
                    <Progress value={perfIndex * 100} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">{(perfIndex * 100).toFixed(0)}%</p>
                  </div>

                  {fantasyPrice > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm text-muted-foreground">Fantasy Price</p>
                      <p className="text-xl font-bold text-accent">{fantasyPrice} tokens</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {recentResult && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Last Result
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-lg">{recentResult.tournament?.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {recentResult.tournament?.location} • {recentResult.discipline}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-bold text-primary">
                    {recentResult.position ? `#${recentResult.position}` : 'DNS'}
                  </p>
                  {recentResult.made_finals && (
                    <span className="text-sm text-green-600">Made Finals</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

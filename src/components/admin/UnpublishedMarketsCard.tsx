import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { BarChart3, Upload, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TournamentWithMarkets {
  id: string;
  name: string;
  startDate: string;
  totalMarkets: number;
  publishedMarkets: number;
  unpublishedCount: number;
}

export function UnpublishedMarketsCard() {
  const queryClient = useQueryClient();
  const [publishingId, setPublishingId] = useState<string | null>(null);

  const { data: unpublishedMarkets, isLoading } = useQuery({
    queryKey: ['admin-unpublished-markets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select(`
          id, name, start_date,
          markets!inner(id, is_published)
        `)
        .is('settled_at', null);
      
      if (error) throw error;
      
      // Calculate published/total for each tournament
      return (data as any[]).map(t => ({
        id: t.id,
        name: t.name,
        startDate: t.start_date,
        totalMarkets: t.markets.length,
        publishedMarkets: t.markets.filter((m: any) => m.is_published).length,
        unpublishedCount: t.markets.filter((m: any) => !m.is_published).length,
      })).filter(t => t.unpublishedCount > 0) as TournamentWithMarkets[];
    },
  });

  const publishAllMutation = useMutation({
    mutationFn: async (tournamentId: string) => {
      setPublishingId(tournamentId);
      
      // 1. Get all unpublished markets for tournament
      const { data: markets, error: fetchError } = await supabase
        .from('markets')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('is_published', false);
      
      if (fetchError) throw fetchError;
      if (!markets?.length) return;
      
      // 2. Regenerate odds for each market
      for (const market of markets) {
        const { error: oddsError } = await supabase.functions.invoke('generate-market-odds', {
          body: { market_id: market.id, force: true }
        });
        if (oddsError) {
          console.error(`Failed to generate odds for market ${market.id}:`, oddsError);
          throw new Error(`Failed to generate odds: ${oddsError.message}`);
        }
      }
      
      // 3. Mark all as published
      const { error: updateError } = await supabase
        .from('markets')
        .update({ is_published: true, published_at: new Date().toISOString() })
        .eq('tournament_id', tournamentId);
      
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-unpublished-markets'] });
      toast.success('All markets published successfully!');
      setPublishingId(null);
    },
    onError: (error: any) => {
      toast.error(`Publish failed: ${error.message}`);
      setPublishingId(null);
    }
  });

  // Don't render if no unpublished markets
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            <CardTitle>Markets Ready to Publish</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!unpublishedMarkets?.length) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <CardTitle>Markets Ready to Publish</CardTitle>
        </div>
        <CardDescription>
          Tournaments with unpublished markets. Publishing regenerates odds and makes markets playable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unpublishedMarkets.map((tournament) => {
          const progressPercent = tournament.totalMarkets > 0 
            ? (tournament.publishedMarkets / tournament.totalMarkets) * 100 
            : 0;
          const isPublishing = publishingId === tournament.id;
          
          return (
            <div key={tournament.id} className="space-y-2 py-3 border-b border-border last:border-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{tournament.name}</span>
                  <Badge variant="secondary">
                    {tournament.unpublishedCount} unpublished
                  </Badge>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => publishAllMutation.mutate(tournament.id)}
                  disabled={isPublishing || publishAllMutation.isPending}
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Publish All
                    </>
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <Progress value={progressPercent} className="flex-1 h-2" />
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {tournament.publishedMarkets}/{tournament.totalMarkets} published
                </span>
              </div>
            </div>
          );
        })}
        
        <p className="text-xs text-muted-foreground pt-2">
          Note: Publishing may take a moment as odds are regenerated via Monte Carlo simulation.
        </p>
      </CardContent>
    </Card>
  );
}

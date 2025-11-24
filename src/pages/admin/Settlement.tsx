import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle } from 'lucide-react';

type Selection = {
  id: string;
  description: string;
  decimal_odds: number;
  result: string | null;
  market_id: string;
  athlete_id: string;
};

type Market = {
  id: string;
  name: string;
  tournament_id: string;
  discipline: string;
  category: string;
};

export default function AdminSettlement() {
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: markets } = useQuery({
    queryKey: ['settlement-markets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Market[];
    },
  });

  const { data: selections } = useQuery({
    queryKey: ['settlement-selections', selectedMarket],
    queryFn: async () => {
      if (!selectedMarket) return [];
      
      const { data, error } = await supabase
        .from('selections')
        .select('*')
        .eq('market_id', selectedMarket);
      
      if (error) throw error;
      return data as Selection[];
    },
    enabled: !!selectedMarket,
  });

  const settleMutation = useMutation({
    mutationFn: async ({ selectionId, result }: { selectionId: string; result: 'won' | 'lost' }) => {
      const { error } = await supabase
        .from('selections')
        .update({ result })
        .eq('id', selectionId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlement-selections'] });
      toast({ title: 'Selection settled successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error settling selection', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Settlement</h2>
          <p className="text-muted-foreground mt-1">Settle market results and predictions</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Market</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedMarket} onValueChange={setSelectedMarket}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a market to settle" />
              </SelectTrigger>
              <SelectContent>
                {markets?.map((market) => (
                  <SelectItem key={market.id} value={market.id}>
                    {market.name} ({market.category} - {market.discipline})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedMarket && selections && selections.length > 0 && (
          <div className="grid gap-4">
            {selections.map((selection) => (
              <Card key={selection.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{selection.description}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Odds: {selection.decimal_odds.toFixed(2)}
                      </p>
                    </div>
                    {selection.result && (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        selection.result === 'won' 
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' 
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {selection.result === 'won' ? 'Won' : 'Lost'}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!selection.result ? (
                    <div className="flex gap-3">
                      <Button
                        onClick={() => settleMutation.mutate({ selectionId: selection.id, result: 'won' })}
                        disabled={settleMutation.isPending}
                        className="flex-1"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Mark as Won
                      </Button>
                      <Button
                        onClick={() => settleMutation.mutate({ selectionId: selection.id, result: 'lost' })}
                        disabled={settleMutation.isPending}
                        variant="destructive"
                        className="flex-1"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Mark as Lost
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This selection has been settled
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {selectedMarket && (!selections || selections.length === 0) && (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No selections found for this market.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

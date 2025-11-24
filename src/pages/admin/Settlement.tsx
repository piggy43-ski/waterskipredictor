import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, AlertCircle, Ban } from 'lucide-react';
import { SettlementConfirmDialog } from '@/components/SettlementConfirmDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Selection = {
  id: string;
  description: string;
  decimal_odds: number;
  result: string | null;
  market_id: string;
  athlete_id: string;
};

type SettlementPreview = {
  pending_predictions: number;
  potential_payout: number;
  affected_users: number;
  selection_description: string;
  result: 'won' | 'lost' | 'void';
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
  const [settlementPreview, setSettlementPreview] = useState<SettlementPreview | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingSettlement, setPendingSettlement] = useState<{ selectionId: string; result: 'won' | 'lost' | 'void' } | null>(null);
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

  const { data: predictionCounts } = useQuery({
    queryKey: ['prediction-counts', selectedMarket],
    queryFn: async () => {
      if (!selectedMarket) return {};
      
      const { data: selections, error } = await supabase
        .from('selections')
        .select('id')
        .eq('market_id', selectedMarket);
      
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      
      for (const selection of selections || []) {
        const { count, error: countError } = await supabase
          .from('predictions')
          .select('*', { count: 'exact', head: true })
          .eq('selection_id', selection.id)
          .eq('status', 'PENDING');
        
        if (!countError) {
          counts[selection.id] = count || 0;
        }
      }
      
      return counts;
    },
    enabled: !!selectedMarket,
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

  const handleSettleClick = async (selectionId: string, result: 'won' | 'lost' | 'void') => {
    const selection = selections?.find(s => s.id === selectionId);
    if (!selection) return;

    // Fetch preview data
    const { data: predictions, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('selection_id', selectionId)
      .eq('status', 'PENDING');

    if (error) {
      toast({ title: 'Error fetching predictions', description: error.message, variant: 'destructive' });
      return;
    }

    const affectedUsers = new Set(predictions?.map(p => p.user_id) || []).size;
    const potentialPayout = predictions?.reduce((sum, p) => {
      if (result === 'won') return sum + p.potential_payout;
      if (result === 'void') return sum + p.staked_tokens;
      return sum;
    }, 0) || 0;

    setSettlementPreview({
      pending_predictions: predictions?.length || 0,
      potential_payout: potentialPayout,
      affected_users: affectedUsers,
      selection_description: selection.description,
      result,
    });

    setPendingSettlement({ selectionId, result });
    setConfirmDialogOpen(true);
  };

  const settleMutation = useMutation({
    mutationFn: async () => {
      if (!pendingSettlement) throw new Error('No pending settlement');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const response = await supabase.functions.invoke('settle-predictions', {
        body: {
          selections: [{
            selection_id: pendingSettlement.selectionId,
            result: pendingSettlement.result,
          }],
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['settlement-selections'] });
      queryClient.invalidateQueries({ queryKey: ['prediction-counts'] });
      setConfirmDialogOpen(false);
      setPendingSettlement(null);
      setSettlementPreview(null);
      
      toast({
        title: 'Settlement completed',
        description: `Settled ${data.settled_predictions} prediction(s), paid out ${data.total_payout.toLocaleString()} tokens to ${data.affected_users} user(s)`,
      });

      if (data.errors && data.errors.length > 0) {
        toast({
          title: 'Some errors occurred',
          description: data.errors.join(', '),
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Settlement failed', description: error.message, variant: 'destructive' });
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
          <>
            {selections.some(s => !s.result) && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Settling selections will automatically update all related predictions and user wallets. This action cannot be undone.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid gap-4">
              {selections.map((selection) => {
                const pendingCount = predictionCounts?.[selection.id] || 0;
                
                return (
                  <Card key={selection.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{selection.description}</CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            Odds: {selection.decimal_odds.toFixed(2)}
                          </p>
                          {pendingCount > 0 && !selection.result && (
                            <p className="text-sm font-medium text-primary mt-2">
                              {pendingCount} pending prediction{pendingCount !== 1 ? 's' : ''}
                            </p>
                          )}
                        </div>
                        {selection.result && (
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                            selection.result === 'won' 
                              ? 'bg-success/10 text-success border border-success/20' 
                              : selection.result === 'lost'
                              ? 'bg-destructive/10 text-destructive border border-destructive/20'
                              : 'bg-secondary/10 text-secondary-foreground border border-secondary/20'
                          }`}>
                            {selection.result === 'won' ? 'Won' : selection.result === 'lost' ? 'Lost' : 'Void'}
                          </span>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {!selection.result ? (
                        <div className="grid grid-cols-3 gap-2">
                          <Button
                            onClick={() => handleSettleClick(selection.id, 'won')}
                            disabled={settleMutation.isPending || pendingCount === 0}
                            className="bg-success hover:bg-success/90 text-success-foreground"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Won
                          </Button>
                          <Button
                            onClick={() => handleSettleClick(selection.id, 'lost')}
                            disabled={settleMutation.isPending || pendingCount === 0}
                            variant="destructive"
                          >
                            <XCircle className="w-4 h-4 mr-2" />
                            Lost
                          </Button>
                          <Button
                            onClick={() => handleSettleClick(selection.id, 'void')}
                            disabled={settleMutation.isPending || pendingCount === 0}
                            variant="secondary"
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            Void
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          This selection has been settled as <span className="font-medium capitalize">{selection.result}</span>
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {selectedMarket && (!selections || selections.length === 0) && (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No selections found for this market.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <SettlementConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        preview={settlementPreview}
        isProcessing={settleMutation.isPending}
        onConfirm={() => settleMutation.mutate()}
      />
    </AdminLayout>
  );
}

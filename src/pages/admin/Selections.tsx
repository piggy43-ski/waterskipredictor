import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import { decimalToAmerican, americanToDecimal } from '@/utils/oddsConverter';

type Market = {
  id: string;
  name: string;
  tournament_id: string;
};

type Athlete = {
  id: string;
  name: string;
  country: string;
};

type Selection = {
  id: string;
  market_id: string;
  athlete_id: string;
  description: string;
  decimal_odds: number;
  result: string | null;
  athlete?: Athlete;
};

export default function AdminSelections() {
  const [open, setOpen] = useState(false);
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [americanOdds, setAmericanOdds] = useState('+150');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: markets } = useQuery({
    queryKey: ['markets-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('id, name, tournament_id')
        .order('name');
      
      if (error) throw error;
      return data as Market[];
    },
  });

  const { data: athletes } = useQuery({
    queryKey: ['athletes-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('id, name, country')
        .order('name');
      
      if (error) throw error;
      return data as Athlete[];
    },
  });

  const { data: selections, isLoading } = useQuery({
    queryKey: ['admin-selections', selectedMarketId],
    queryFn: async () => {
      if (!selectedMarketId) return [];
      
      const { data, error } = await supabase
        .from('selections')
        .select(`
          *,
          athlete:athletes(id, name, country)
        `)
        .eq('market_id', selectedMarketId)
        .order('decimal_odds');
      
      if (error) throw error;
      return data as Selection[];
    },
    enabled: !!selectedMarketId,
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const americanOddsValue = formData.get('odds') as string;
      const decimalOdds = americanToDecimal(americanOddsValue);
      
      const selection = {
        market_id: selectedMarketId,
        athlete_id: formData.get('athlete_id') as string,
        description: formData.get('description') as string,
        decimal_odds: decimalOdds,
      };

      const { error } = await supabase.from('selections').insert(selection);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-selections'] });
      setOpen(false);
      setAmericanOdds('+150');
      toast({ title: 'Selection created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating selection', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('selections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-selections'] });
      toast({ title: 'Selection deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting selection', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate(formData);
  };

  const validateAmericanOdds = (value: string): boolean => {
    const num = parseFloat(value);
    return (num >= 100 || num <= -100) && !isNaN(num);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Selections</h2>
            <p className="text-muted-foreground mt-1">Manage betting selections and odds</p>
          </div>
        </div>

        {/* Market Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Select Market</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedMarketId} onValueChange={setSelectedMarketId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a market to manage selections" />
              </SelectTrigger>
              <SelectContent>
                {markets?.map((market) => (
                  <SelectItem key={market.id} value={market.id}>
                    {market.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedMarketId && (
          <>
            <div className="flex justify-end">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Selection
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Selection</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="athlete_id">Athlete</Label>
                      <Select name="athlete_id" required>
                        <SelectTrigger>
                          <SelectValue placeholder="Select athlete" />
                        </SelectTrigger>
                        <SelectContent>
                          {athletes?.map((athlete) => (
                            <SelectItem key={athlete.id} value={athlete.id}>
                              {athlete.name} ({athlete.country})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="description">Description</Label>
                      <Input 
                        id="description" 
                        name="description" 
                        placeholder="e.g., To win tournament" 
                        required 
                      />
                    </div>
                    <div>
                      <Label htmlFor="odds">American Odds</Label>
                      <Input
                        id="odds"
                        name="odds"
                        value={americanOdds}
                        onChange={(e) => setAmericanOdds(e.target.value)}
                        placeholder="+150 or -200"
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter +100 or higher for underdogs, -100 or lower for favorites
                      </p>
                      {americanOdds && (
                        <p className="text-xs text-primary mt-1">
                          Decimal: {americanToDecimal(americanOdds).toFixed(2)}
                        </p>
                      )}
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={createMutation.isPending || !validateAmericanOdds(americanOdds)}
                    >
                      {createMutation.isPending ? 'Creating...' : 'Create Selection'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {isLoading ? (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground">Loading selections...</p>
                </CardContent>
              </Card>
            ) : selections && selections.length > 0 ? (
              <div className="grid gap-4">
                {selections.map((selection) => (
                  <Card key={selection.id}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg">
                            {selection.athlete?.name || 'Unknown Athlete'}
                          </CardTitle>
                          <p className="text-sm text-muted-foreground mt-1">
                            {selection.description}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => deleteMutation.mutate(selection.id)}
                          disabled={deleteMutation.isPending || !!selection.result}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-primary">
                          <TrendingUp className="w-4 h-4" />
                          <span className="font-bold text-lg">
                            {decimalToAmerican(selection.decimal_odds)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({selection.decimal_odds.toFixed(2)})
                          </span>
                        </div>
                        {selection.result && (
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            selection.result === 'won' 
                              ? 'bg-success/20 text-success' 
                              : selection.result === 'lost'
                              ? 'bg-destructive/20 text-destructive'
                              : 'bg-muted text-muted-foreground'
                          }`}>
                            {selection.result.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-muted-foreground">
                    No selections for this market. Create your first selection to get started.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}
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
import { Plus, Trash2 } from 'lucide-react';

type Market = {
  id: string;
  name: string;
  tournament_id: string;
  category: string;
  discipline: string;
  market_type: string;
};

type Tournament = {
  id: string;
  name: string;
};

export default function AdminMarkets() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tournaments } = useQuery({
    queryKey: ['tournaments-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name')
        .order('name');
      
      if (error) throw error;
      return data as Tournament[];
    },
  });

  const { data: markets, isLoading } = useQuery({
    queryKey: ['admin-markets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('markets')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Market[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const market = {
        name: formData.get('name') as string,
        tournament_id: formData.get('tournament_id') as string,
        category: formData.get('category') as string,
        discipline: formData.get('discipline') as string,
        market_type: formData.get('market_type') as string,
      };

      const { error } = await supabase.from('markets').insert(market);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      setOpen(false);
      toast({ title: 'Market created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating market', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('markets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-markets'] });
      toast({ title: 'Market deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting market', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate(formData);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Markets</h2>
            <p className="text-muted-foreground mt-1">Manage betting markets</p>
          </div>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Market
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Market</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Market Name</Label>
                  <Input id="name" name="name" placeholder="e.g., Winner - Men's Slalom" required />
                </div>
                <div>
                  <Label htmlFor="tournament_id">Tournament</Label>
                  <Select name="tournament_id" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tournament" />
                    </SelectTrigger>
                    <SelectContent>
                      {tournaments?.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select name="category" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="men">Men</SelectItem>
                      <SelectItem value="women">Women</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="discipline">Discipline</Label>
                  <Select name="discipline" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select discipline" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="slalom">Slalom</SelectItem>
                      <SelectItem value="trick">Trick</SelectItem>
                      <SelectItem value="jump">Jump</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="market_type">Market Type</Label>
                  <Select name="market_type" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="winner">Winner</SelectItem>
                      <SelectItem value="top3">Top 3</SelectItem>
                      <SelectItem value="podium">Podium Finish</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Market'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Loading markets...</p>
            </CardContent>
          </Card>
        ) : markets && markets.length > 0 ? (
          <div className="grid gap-4">
            {markets.map((market) => (
              <Card key={market.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{market.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {market.category} • {market.discipline}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => deleteMutation.mutate(market.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-sm">
                    {market.market_type}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No markets found. Create your first market to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

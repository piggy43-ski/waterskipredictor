import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

type Reward = {
  id: string;
  name: string;
  description: string;
  partner: string;
  category: string;
  required_tokens: number;
  available: boolean;
};

export default function AdminRewards() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: rewards, isLoading } = useQuery({
    queryKey: ['admin-rewards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rewards')
        .select('*')
        .order('required_tokens');
      
      if (error) throw error;
      return data as Reward[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const reward = {
        name: formData.get('name') as string,
        description: formData.get('description') as string,
        partner: formData.get('partner') as string,
        category: formData.get('category') as string,
        required_tokens: parseInt(formData.get('required_tokens') as string),
        available: true,
      };

      const { error } = await supabase.from('rewards').insert(reward);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rewards'] });
      setOpen(false);
      toast({ title: 'Reward created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating reward', description: error.message, variant: 'destructive' });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, available }: { id: string; available: boolean }) => {
      const { error } = await supabase
        .from('rewards')
        .update({ available })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rewards'] });
      toast({ title: 'Reward updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating reward', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('rewards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-rewards'] });
      toast({ title: 'Reward deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting reward', description: error.message, variant: 'destructive' });
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
            <h2 className="text-3xl font-bold text-foreground">Rewards</h2>
            <p className="text-muted-foreground mt-1">Manage reward catalog</p>
          </div>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Reward
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Reward</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Reward Name</Label>
                  <Input id="name" name="name" required />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" required />
                </div>
                <div>
                  <Label htmlFor="partner">Partner</Label>
                  <Input id="partner" name="partner" required />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select name="category" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="merchandise">Merchandise</SelectItem>
                      <SelectItem value="experience">Experience</SelectItem>
                      <SelectItem value="discount">Discount</SelectItem>
                      <SelectItem value="vip">VIP Access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="required_tokens">Required Tokens</Label>
                  <Input id="required_tokens" name="required_tokens" type="number" min="1" required />
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Reward'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Loading rewards...</p>
            </CardContent>
          </Card>
        ) : rewards && rewards.length > 0 ? (
          <div className="grid gap-4">
            {rewards.map((reward) => (
              <Card key={reward.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle>{reward.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {reward.partner} • {reward.category}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {reward.description}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => deleteMutation.mutate(reward.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-1 bg-primary text-primary-foreground rounded text-sm font-medium">
                      {reward.required_tokens} tokens
                    </span>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`available-${reward.id}`} className="text-sm">Available</Label>
                      <Switch
                        id={`available-${reward.id}`}
                        checked={reward.available}
                        onCheckedChange={(checked) => 
                          toggleMutation.mutate({ id: reward.id, available: checked })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No rewards found. Create your first reward to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

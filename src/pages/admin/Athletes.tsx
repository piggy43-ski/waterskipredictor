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

type Athlete = {
  id: string;
  name: string;
  country: string;
  gender: string;
  year_of_birth: number;
  disciplines: string[];
  federation: string;
};

export default function AdminAthletes() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: athletes, isLoading } = useQuery({
    queryKey: ['admin-athletes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Athlete[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const athlete = {
        name: formData.get('name') as string,
        country: formData.get('country') as string,
        gender: formData.get('gender') as string,
        year_of_birth: parseInt(formData.get('year_of_birth') as string),
        disciplines: [formData.get('discipline') as string],
        federation: formData.get('federation') as string,
      };

      const { error } = await supabase.from('athletes').insert(athlete);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-athletes'] });
      setOpen(false);
      toast({ title: 'Athlete created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating athlete', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('athletes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-athletes'] });
      toast({ title: 'Athlete deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting athlete', description: error.message, variant: 'destructive' });
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
            <h2 className="text-3xl font-bold text-foreground">Athletes</h2>
            <p className="text-muted-foreground mt-1">Manage athlete profiles</p>
          </div>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Athlete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Athlete</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" required />
                </div>
                <div>
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" name="country" required />
                </div>
                <div>
                  <Label htmlFor="federation">Federation</Label>
                  <Input id="federation" name="federation" required />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select name="gender" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="year_of_birth">Year of Birth</Label>
                  <Input id="year_of_birth" name="year_of_birth" type="number" min="1950" max="2010" required />
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
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Creating...' : 'Create Athlete'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Loading athletes...</p>
            </CardContent>
          </Card>
        ) : athletes && athletes.length > 0 ? (
          <div className="grid gap-4">
            {athletes.map((athlete) => (
              <Card key={athlete.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{athlete.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {athlete.country} • {athlete.federation}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => deleteMutation.mutate(athlete.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm">
                    <span className="px-2 py-1 bg-secondary text-secondary-foreground rounded">
                      {athlete.gender}
                    </span>
                    <span className="text-muted-foreground">
                      Born: {athlete.year_of_birth}
                    </span>
                    <span className="text-muted-foreground">
                      {athlete.disciplines.join(', ')}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No athletes found. Create your first athlete to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

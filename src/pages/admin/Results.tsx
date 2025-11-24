import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

type Discipline = 'slalom' | 'trick' | 'jump';
type Gender = 'male' | 'female';

export default function Results() {
  const [open, setOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState('');
  const [selectedAthlete, setSelectedAthlete] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<Discipline>('slalom');
  const [selectedGender, setSelectedGender] = useState<Gender>('male');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tournaments } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: athletes } = useQuery({
    queryKey: ['admin-athletes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: results } = useQuery({
    queryKey: ['admin-results'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athlete_results')
        .select(`
          *,
          athlete:athletes(name, country),
          tournament:tournaments(name)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const result = {
        athlete_id: formData.get('athlete_id') as string,
        tournament_id: formData.get('tournament_id') as string,
        discipline: formData.get('discipline') as string,
        gender: formData.get('gender') as string,
        position: parseInt(formData.get('position') as string) || null,
        made_finals: formData.get('made_finals') === 'true',
        missed_first_pass: formData.get('missed_first_pass') === 'true',
        missed_gate: formData.get('missed_gate') === 'true',
        score_raw: parseFloat(formData.get('score_raw') as string) || null,
      };

      const { error } = await supabase.from('athlete_results').insert(result);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-results'] });
      setOpen(false);
      toast({ title: 'Result added successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error adding result', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('athlete_results').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-results'] });
      toast({ title: 'Result deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting result', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate(formData);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Tournament Results</h2>
            <p className="text-muted-foreground mt-1">Enter athlete placements after events</p>
          </div>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Result
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Tournament Result</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="tournament_id">Tournament</Label>
                    <Select name="tournament_id" required value={selectedTournament} onValueChange={setSelectedTournament}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select tournament" />
                      </SelectTrigger>
                      <SelectContent>
                        {tournaments?.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="athlete_id">Athlete</Label>
                    <Select name="athlete_id" required value={selectedAthlete} onValueChange={setSelectedAthlete}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select athlete" />
                      </SelectTrigger>
                      <SelectContent>
                        {athletes?.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} ({a.country})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="discipline">Discipline</Label>
                    <Select name="discipline" required value={selectedDiscipline} onValueChange={(v) => setSelectedDiscipline(v as Discipline)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="slalom">Slalom</SelectItem>
                        <SelectItem value="trick">Trick</SelectItem>
                        <SelectItem value="jump">Jump</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="gender">Gender</Label>
                    <Select name="gender" required value={selectedGender} onValueChange={(v) => setSelectedGender(v as Gender)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Open Men</SelectItem>
                        <SelectItem value="female">Open Women</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="position">Position</Label>
                    <Input id="position" name="position" type="number" min="1" placeholder="1, 2, 3..." />
                  </div>

                  <div>
                    <Label htmlFor="score_raw">Raw Score</Label>
                    <Input id="score_raw" name="score_raw" type="number" step="0.01" placeholder="Buoys/Points/Distance" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="made_finals" name="made_finals" value="true" className="rounded" />
                    <Label htmlFor="made_finals">Made Finals</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="missed_first_pass" name="missed_first_pass" value="true" className="rounded" />
                    <Label htmlFor="missed_first_pass">Missed First Pass (DNQ)</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input type="checkbox" id="missed_gate" name="missed_gate" value="true" className="rounded" />
                    <Label htmlFor="missed_gate">Missed Gate</Label>
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Adding...' : 'Add Result'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {results && results.length > 0 ? (
          <div className="grid gap-4">
            {results.map((result: any) => (
              <Card key={result.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{result.athlete?.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {result.tournament?.name} • {result.discipline} • {result.gender === 'male' ? 'Men' : 'Women'}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => deleteMutation.mutate(result.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-4 text-sm">
                    <span className="px-2 py-1 bg-primary/10 text-primary rounded font-bold">
                      {result.position ? `#${result.position}` : 'DNS'}
                    </span>
                    {result.made_finals && (
                      <span className="px-2 py-1 bg-green-500/10 text-green-600 rounded">Finals</span>
                    )}
                    {result.missed_first_pass && (
                      <span className="px-2 py-1 bg-red-500/10 text-red-600 rounded">DNQ</span>
                    )}
                    {result.missed_gate && (
                      <span className="px-2 py-1 bg-yellow-500/10 text-yellow-600 rounded">Missed Gate</span>
                    )}
                    {result.score_raw && (
                      <span className="text-muted-foreground">Score: {result.score_raw}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No results found. Add your first result to get started.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { format } from 'date-fns';

type Tournament = {
  id: string;
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  status: string;
  disciplines: string[];
};

export default function AdminTournaments() {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [editDisciplines, setEditDisciplines] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      return data as Tournament[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const tournament = {
        name: formData.get('name') as string,
        location: formData.get('location') as string,
        start_date: formData.get('start_date') as string || null,
        end_date: formData.get('end_date') as string || null,
        status: formData.get('status') as string,
        disciplines: disciplines,
      };

      const { error } = await supabase.from('tournaments').insert(tournament);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tournaments'] });
      setOpen(false);
      setDisciplines([]);
      toast({ title: 'Tournament created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating tournament', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Tournament> }) => {
      const { error } = await supabase
        .from('tournaments')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tournaments'] });
      setEditOpen(false);
      setEditingTournament(null);
      setEditDisciplines([]);
      toast({ title: 'Tournament updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating tournament', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tournaments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tournaments'] });
      toast({ title: 'Tournament deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting tournament', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate(formData);
  };

  const handleEdit = (tournament: Tournament) => {
    setEditingTournament(tournament);
    setEditDisciplines(tournament.disciplines || []);
    setEditOpen(true);
  };

  const handleEditSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTournament) return;

    const formData = new FormData(e.currentTarget);
    const updates = {
      name: formData.get('name') as string,
      location: formData.get('location') as string,
      start_date: formData.get('start_date') as string || null,
      end_date: formData.get('end_date') as string || null,
      status: formData.get('status') as string,
      disciplines: editDisciplines,
    };

    updateMutation.mutate({ id: editingTournament.id, updates });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Tournaments</h2>
            <p className="text-muted-foreground mt-1">Manage tournament listings</p>
          </div>
          
          <Dialog open={open} onOpenChange={(newOpen) => {
            setOpen(newOpen);
            if (!newOpen) setDisciplines([]);
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Tournament
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Tournament</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Tournament Name</Label>
                  <Input id="name" name="name" required />
                </div>
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input id="location" name="location" required />
                </div>
                <div>
                  <Label htmlFor="start_date">Start Date (Optional)</Label>
                  <Input id="start_date" name="start_date" type="date" />
                </div>
                <div>
                  <Label htmlFor="end_date">End Date (Optional)</Label>
                  <Input id="end_date" name="end_date" type="date" />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue="upcoming" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="finished">Finished</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Disciplines</Label>
                  <div className="flex gap-4">
                    {['slalom', 'trick', 'jump'].map((disc) => (
                      <div key={disc} className="flex items-center space-x-2">
                        <Checkbox
                          id={`create-disc-${disc}`}
                          checked={disciplines.includes(disc)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setDisciplines([...disciplines, disc]);
                            } else {
                              setDisciplines(disciplines.filter(d => d !== disc));
                            }
                          }}
                        />
                        <label htmlFor={`create-disc-${disc}`} className="capitalize cursor-pointer">
                          {disc}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending || disciplines.length === 0}>
                  {createMutation.isPending ? 'Creating...' : 'Create Tournament'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Loading tournaments...</p>
            </CardContent>
          </Card>
        ) : tournaments && tournaments.length > 0 ? (
          <div className="grid gap-4">
            {tournaments.map((tournament) => (
              <Card key={tournament.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{tournament.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tournament.location} • {tournament.start_date ? format(new Date(tournament.start_date), 'MMM d, yyyy') : 'TBD'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/admin/tournament-entries')}
                      >
                        <Users className="w-4 h-4 mr-2" />
                        Manage Entries
                      </Button>
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => handleEdit(tournament)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => deleteMutation.mutate(tournament.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2 items-center flex-wrap">
                    <Badge variant="secondary">
                      {tournament.status}
                    </Badge>
                    {tournament.disciplines.map((disc) => (
                      <Badge key={disc} variant="outline" className="capitalize">
                        {disc}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No tournaments found. Create your first tournament to get started.</p>
            </CardContent>
          </Card>
        )}

        {/* Edit Dialog */}
      <Dialog 
        open={editOpen} 
        onOpenChange={(open) => {
          setEditOpen(open);
          if (open && editingTournament) {
            setEditDisciplines(editingTournament.disciplines || []);
          } else {
            setEditDisciplines([]);
          }
        }}
      >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Tournament</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Tournament Name</Label>
                <Input 
                  id="edit-name" 
                  name="name" 
                  defaultValue={editingTournament?.name}
                  required 
                />
              </div>
              <div>
                <Label htmlFor="edit-location">Location</Label>
                <Input 
                  id="edit-location" 
                  name="location" 
                  defaultValue={editingTournament?.location}
                  required 
                />
              </div>
              <div>
                <Label htmlFor="edit-start">Start Date</Label>
                <Input 
                  id="edit-start" 
                  name="start_date" 
                  type="date" 
                  defaultValue={editingTournament?.start_date || ''}
                />
              </div>
              <div>
                <Label htmlFor="edit-end">End Date</Label>
                <Input 
                  id="edit-end" 
                  name="end_date" 
                  type="date" 
                  defaultValue={editingTournament?.end_date || ''}
                />
              </div>
              <div>
                <Label htmlFor="edit-status">Status</Label>
                <Select name="status" defaultValue={editingTournament?.status} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="finished">Finished</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Disciplines</Label>
                <div className="flex gap-4">
                  {['slalom', 'trick', 'jump'].map((disc) => (
                    <div key={disc} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-disc-${disc}`}
                        checked={editDisciplines.includes(disc)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditDisciplines([...editDisciplines, disc]);
                          } else {
                            setEditDisciplines(editDisciplines.filter(d => d !== disc));
                          }
                        }}
                      />
                      <label htmlFor={`edit-disc-${disc}`} className="capitalize cursor-pointer">
                        {disc}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={updateMutation.isPending || editDisciplines.length === 0}>
                {updateMutation.isPending ? 'Updating...' : 'Update Tournament'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

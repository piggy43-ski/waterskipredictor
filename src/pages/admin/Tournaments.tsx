import { useState, useEffect, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Users } from 'lucide-react';
import { format } from 'date-fns';
import { applyDynamicStatus } from '@/utils/tournamentStatus';

// Helper to format database datetime to datetime-local input format
const formatDatetimeForInput = (datetime: string | undefined | null): string => {
  if (!datetime) return '';
  try {
    const date = new Date(datetime);
    if (isNaN(date.getTime())) return '';
    // Format as YYYY-MM-DDTHH:MM for datetime-local input
    return date.toISOString().slice(0, 16);
  } catch {
    return '';
  }
};

// Helper to get today's date with default time
const getDefaultDatetime = (defaultHour: number): string => {
  const now = new Date();
  now.setHours(defaultHour, 0, 0, 0);
  return now.toISOString().slice(0, 16);
};

type Tournament = {
  id: string;
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  start_datetime?: string;
  end_datetime?: string;
  status: string;
  disciplines: string[];
  settled_at?: string | null;
  has_qualifying?: boolean;
  has_semifinal?: boolean;
  has_final?: boolean;
};

export default function AdminTournaments() {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [disciplines, setDisciplines] = useState<string[]>([]);
  const [editDisciplines, setEditDisciplines] = useState<string[]>([]);
  
  // Controlled state for create form datetime inputs
  const [createStartDatetime, setCreateStartDatetime] = useState('');
  const [createEndDatetime, setCreateEndDatetime] = useState('');
  
  // Controlled state for edit form datetime inputs
  const [editStartDatetime, setEditStartDatetime] = useState('');
  const [editEndDatetime, setEditEndDatetime] = useState('');
  
  // Round structure state for create form
  const [hasQualifying, setHasQualifying] = useState(false);
  const [hasSemifinal, setHasSemifinal] = useState(false);
  
  // Round structure state for edit form
  const [editHasQualifying, setEditHasQualifying] = useState(false);
  const [editHasSemifinal, setEditHasSemifinal] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  // When edit dialog opens, populate the datetime and round structure fields
  useEffect(() => {
    if (editOpen && editingTournament) {
      setEditStartDatetime(formatDatetimeForInput(editingTournament.start_datetime));
      setEditEndDatetime(formatDatetimeForInput(editingTournament.end_datetime));
      setEditHasQualifying(editingTournament.has_qualifying ?? false);
      setEditHasSemifinal(editingTournament.has_semifinal ?? false);
    }
  }, [editOpen, editingTournament]);
  
  // Auto-set default times when date portion changes
  const handleStartDatetimeChange = (value: string, isEdit: boolean) => {
    if (isEdit) {
      setEditStartDatetime(value);
    } else {
      setCreateStartDatetime(value);
      // If end datetime is empty or on a different day, auto-set end to same day at 6PM
      if (!createEndDatetime || value.split('T')[0] !== createEndDatetime.split('T')[0]) {
        const endValue = value.split('T')[0] + 'T18:00';
        setCreateEndDatetime(endValue);
      }
    }
  };
  
  const handleEndDatetimeChange = (value: string, isEdit: boolean) => {
    if (isEdit) {
      setEditEndDatetime(value);
    } else {
      setCreateEndDatetime(value);
    }
  };

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      return (data || []).map(t => ({
        ...t,
        status: applyDynamicStatus(t).status
      })) as Tournament[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const startDatetime = createStartDatetime || null;
      const endDatetime = createEndDatetime || null;
      
      const tournament = {
        name: formData.get('name') as string,
        location: formData.get('location') as string,
        start_datetime: startDatetime,
        end_datetime: endDatetime,
        // Keep old fields for backward compatibility
        start_date: startDatetime ? startDatetime.split('T')[0] : null,
        end_date: endDatetime ? endDatetime.split('T')[0] : null,
        status: 'upcoming', // Auto-calculate, but set default
        disciplines: disciplines,
        has_qualifying: hasQualifying,
        has_semifinal: hasSemifinal,
        has_final: true,
      };

      const { error } = await supabase.from('tournaments').insert(tournament);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tournaments'] });
      setOpen(false);
      setDisciplines([]);
      setCreateStartDatetime('');
      setCreateEndDatetime('');
      setHasQualifying(false);
      setHasSemifinal(false);
      toast({ title: 'Tournament created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating tournament', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
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
    const startDatetime = editStartDatetime || null;
    const endDatetime = editEndDatetime || null;
    
    const updates = {
      name: formData.get('name') as string,
      location: formData.get('location') as string,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      // Keep old fields synced for backward compatibility
      start_date: startDatetime ? startDatetime.split('T')[0] : null,
      end_date: endDatetime ? endDatetime.split('T')[0] : null,
      disciplines: editDisciplines,
      has_qualifying: editHasQualifying,
      has_semifinal: editHasSemifinal,
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
            if (!newOpen) {
              setDisciplines([]);
              setCreateStartDatetime('');
              setCreateEndDatetime('');
              setHasQualifying(false);
              setHasSemifinal(false);
            }
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
                  <Label htmlFor="start_datetime">Start Date & Time</Label>
                  <Input 
                    id="start_datetime" 
                    name="start_datetime" 
                    type="datetime-local" 
                    value={createStartDatetime}
                    onChange={(e) => handleStartDatetimeChange(e.target.value, false)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Betting locks at this time (defaults to 8:00 AM)
                  </p>
                </div>
                <div>
                  <Label htmlFor="end_datetime">End Date & Time</Label>
                  <Input 
                    id="end_datetime" 
                    name="end_datetime" 
                    type="datetime-local" 
                    value={createEndDatetime}
                    onChange={(e) => handleEndDatetimeChange(e.target.value, false)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Status becomes "Finished" at this time (defaults to 6:00 PM)
                  </p>
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
                <div className="space-y-2">
                  <Label>Round Structure</Label>
                  <p className="text-xs text-muted-foreground">
                    Select which rounds this tournament will have
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="create-has-qualifying"
                        checked={hasQualifying}
                        onCheckedChange={(checked) => setHasQualifying(checked === true)}
                      />
                      <label htmlFor="create-has-qualifying" className="cursor-pointer">
                        Qualification Round
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="create-has-semifinal"
                        checked={hasSemifinal}
                        onCheckedChange={(checked) => setHasSemifinal(checked === true)}
                      />
                      <label htmlFor="create-has-semifinal" className="cursor-pointer">
                        Semi-Finals
                      </label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="create-has-final" checked={true} disabled />
                      <label className="text-muted-foreground">
                        Finals (required)
                      </label>
                    </div>
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
                    {tournament.status === 'finished' && (
                      tournament.settled_at ? (
                        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                          Settled
                        </Badge>
                      ) : (
                        <Badge variant="default" className="bg-orange-600 hover:bg-orange-700">
                          Pending Settlement
                        </Badge>
                      )
                    )}
                    {(tournament.disciplines || []).map((disc) => (
                      <Badge key={disc} variant="outline" className="capitalize">
                        {disc}
                      </Badge>
                    ))}
                    <div className="ml-auto flex gap-1">
                      {tournament.has_qualifying && (
                        <Badge variant="secondary" className="text-xs">Qual</Badge>
                      )}
                      {tournament.has_semifinal && (
                        <Badge variant="secondary" className="text-xs">Semi</Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">Final</Badge>
                    </div>
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
          // TODO(shadow): rename when touching this code
          // eslint-disable-next-line @typescript-eslint/no-shadow
          onOpenChange={(open) => {
            setEditOpen(open);
            if (open && editingTournament) {
              setEditDisciplines(editingTournament.disciplines || []);
            } else {
              setEditDisciplines([]);
              setEditStartDatetime('');
              setEditEndDatetime('');
              setEditHasQualifying(false);
              setEditHasSemifinal(false);
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
                <Label htmlFor="edit-start-datetime">Start Date & Time</Label>
                <Input 
                  id="edit-start-datetime" 
                  name="start_datetime" 
                  type="datetime-local" 
                  value={editStartDatetime}
                  onChange={(e) => handleStartDatetimeChange(e.target.value, true)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Betting locks at this time
                </p>
              </div>
              <div>
                <Label htmlFor="edit-end-datetime">End Date & Time</Label>
                <Input 
                  id="edit-end-datetime" 
                  name="end_datetime" 
                  type="datetime-local" 
                  value={editEndDatetime}
                  onChange={(e) => handleEndDatetimeChange(e.target.value, true)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Status becomes "Finished" at this time
                </p>
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
              <div className="space-y-2">
                <Label>Round Structure</Label>
                <p className="text-xs text-muted-foreground">
                  Select which rounds this tournament will have
                </p>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-has-qualifying"
                      checked={editHasQualifying}
                      onCheckedChange={(checked) => setEditHasQualifying(checked === true)}
                    />
                    <label htmlFor="edit-has-qualifying" className="cursor-pointer">
                      Qualification Round
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="edit-has-semifinal"
                      checked={editHasSemifinal}
                      onCheckedChange={(checked) => setEditHasSemifinal(checked === true)}
                    />
                    <label htmlFor="edit-has-semifinal" className="cursor-pointer">
                      Semi-Finals
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox id="edit-has-final" checked={true} disabled />
                    <label className="text-muted-foreground">
                      Finals (required)
                    </label>
                  </div>
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

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Pencil, Trash2, Users, Trophy, Crown, Coins, Info, Play } from 'lucide-react';
import { format } from 'date-fns';
import { FANTASY_TEAM_BUDGET, PAYOUT_STRUCTURES, DEFAULT_HOUSE_RAKE_PERCENT, SEASON_TIERS } from '@/utils/fantasyConfig';

type Tournament = {
  id: string;
  name: string;
  location: string;
  start_date: string;
};

type FantasyPot = {
  id: string;
  name: string;
  pot_type: string;
  tournament_id: string | null;
  entry_fee_tokens: number;
  status: string;
  visibility: string;
  max_entrants: number | null;
  discipline_scope: string[];
  payout_structure: string;
  team_budget: number;
  house_rake_percent: number;
  created_at: string;
  invite_code: string | null;
  tournament?: Tournament;
  entrant_count?: number;
};

export default function AdminFantasyPots() {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingPot, setEditingPot] = useState<FantasyPot | null>(null);
  const [disciplines, setDisciplines] = useState<string[]>(['slalom', 'trick', 'jump']);
  const [editDisciplines, setEditDisciplines] = useState<string[]>([]);
  const [potType, setPotType] = useState<string>('tournament');
  const [scoringFantasy, setScoringFantasy] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: pots, isLoading } = useQuery({
    queryKey: ['admin-fantasy-pots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fantasy_pots')
        .select(`
          *,
          tournament:tournaments!tournament_id(id, name, location, start_date)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Get entrant counts
      const potsWithCounts = await Promise.all(
        (data || []).map(async (pot) => {
          const { count } = await supabase
            .from('fantasy_entries')
            .select('*', { count: 'exact', head: true })
            .eq('pot_id', pot.id);
          
          return {
            ...pot,
            entrant_count: count || 0,
            tournament: pot.tournament as Tournament | undefined
          } as FantasyPot;
        })
      );
      
      return potsWithCounts;
    },
  });

  const { data: tournaments } = useQuery({
    queryKey: ['admin-tournaments-for-pots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, location, start_date')
        .in('status', ['upcoming', 'live'])
        .order('start_date', { ascending: true });
      
      if (error) throw error;
      return data as Tournament[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const selectedPotType = formData.get('pot_type') as string;
      const isSeasonType = selectedPotType === 'season';
      
      const pot = {
        name: formData.get('name') as string,
        pot_type: selectedPotType,
        // Season pots don't need a tournament_id - they auto-link to ALL tournaments
        tournament_id: isSeasonType ? null : ((formData.get('tournament_id') as string) === 'none' ? null : formData.get('tournament_id') as string),
        entry_fee_tokens: parseInt(formData.get('entry_fee_tokens') as string) || 100,
        max_entrants: parseInt(formData.get('max_entrants') as string) || null,
        team_budget: parseInt(formData.get('team_budget') as string) || FANTASY_TEAM_BUDGET,
        payout_structure: formData.get('payout_structure') as string || 'top_3_split',
        // Admin-created leagues are ALWAYS public
        visibility: 'public',
        discipline_scope: disciplines,
        status: 'open',
        house_rake_percent: DEFAULT_HOUSE_RAKE_PERCENT,
        created_by: user!.id,
      };

      const { error } = await supabase.from('fantasy_pots').insert(pot);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-fantasy-pots'] });
      setOpen(false);
      setDisciplines(['slalom', 'trick', 'jump']);
      setPotType('tournament');
      toast({ title: 'Fantasy league created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating league', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: any }) => {
      const { error } = await supabase
        .from('fantasy_pots')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-fantasy-pots'] });
      setEditOpen(false);
      setEditingPot(null);
      toast({ title: 'Fantasy league updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating league', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fantasy_pots').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-fantasy-pots'] });
      toast({ title: 'Fantasy league deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting league', description: error.message, variant: 'destructive' });
    },
  });

  const scoreFantasyMutation = useMutation({
    mutationFn: async (potId: string) => {
      const pot = pots?.find(p => p.id === potId);
      if (!pot) throw new Error('Pot not found');

      // For tournament pots, score that tournament
      // For season pots, we'd need to score all tournaments
      const tournamentId = pot.tournament_id;
      
      if (!tournamentId && pot.pot_type === 'tournament') {
        throw new Error('No tournament linked to this pot');
      }

      const response = await supabase.functions.invoke('score-fantasy', {
        body: { tournament_id: tournamentId, pot_id: potId }
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['admin-fantasy-pots'] });
      toast({ 
        title: 'Fantasy Scored!', 
        description: `Updated ${data?.entries_updated || 0} entries` 
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error scoring fantasy', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate(formData);
  };

  const handleEdit = (pot: FantasyPot) => {
    setEditingPot(pot);
    setEditDisciplines(pot.discipline_scope || []);
    setEditOpen(true);
  };

  const handleEditSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingPot) return;

    const formData = new FormData(e.currentTarget);
    const updates = {
      name: formData.get('name') as string,
      pot_type: formData.get('pot_type') as string,
      tournament_id: (formData.get('tournament_id') as string) === 'none' ? null : formData.get('tournament_id') as string,
      entry_fee_tokens: parseInt(formData.get('entry_fee_tokens') as string) || 100,
      max_entrants: parseInt(formData.get('max_entrants') as string) || null,
      team_budget: parseInt(formData.get('team_budget') as string) || FANTASY_TEAM_BUDGET,
      payout_structure: formData.get('payout_structure') as string,
      visibility: formData.get('visibility') as string,
      status: formData.get('status') as string,
      discipline_scope: editDisciplines,
    };

    updateMutation.mutate({ id: editingPot.id, updates });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-green-600';
      case 'locked': return 'bg-yellow-600';
      case 'settled': return 'bg-blue-600';
      case 'cancelled': return 'bg-red-600';
      default: return 'bg-gray-600';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Crown className="w-8 h-8" />
              Fantasy Leagues
            </h2>
            <p className="text-muted-foreground mt-1">Create and manage fantasy leagues/pots</p>
          </div>
          
          <Dialog open={open} onOpenChange={(newOpen) => {
            setOpen(newOpen);
            if (!newOpen) {
              setDisciplines(['slalom', 'trick', 'jump']);
              setPotType('tournament');
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create League
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create Fantasy League</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">League Name</Label>
                  <Input id="name" name="name" placeholder="e.g., Moomba Masters Fantasy" required />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="pot_type">Type</Label>
                    <Select name="pot_type" defaultValue="tournament" onValueChange={setPotType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="tournament">Tournament</SelectItem>
                        <SelectItem value="season">Season (All Tournaments)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Visibility</Label>
                    <Input value="Public" disabled className="bg-muted" />
                    <p className="text-xs text-muted-foreground mt-1">Admin leagues are always public</p>
                  </div>
                </div>

                {potType === 'season' && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Season leagues automatically include ALL tournaments. Scoring accumulates across all events.
                    </AlertDescription>
                  </Alert>
                )}

                {potType === 'tournament' && (
                  <div>
                    <Label htmlFor="tournament_id">Linked Tournament</Label>
                    <Select name="tournament_id" defaultValue="none">
                      <SelectTrigger>
                        <SelectValue placeholder="Select a tournament" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No tournament</SelectItem>
                        {tournaments?.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.location})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="entry_fee_tokens">Entry Fee (tokens)</Label>
                    <Input 
                      id="entry_fee_tokens" 
                      name="entry_fee_tokens" 
                      type="number" 
                      defaultValue="100"
                      min="0"
                      required 
                    />
                  </div>
                  <div>
                    <Label htmlFor="max_entrants">Max Entrants</Label>
                    <Input 
                      id="max_entrants" 
                      name="max_entrants" 
                      type="number" 
                      placeholder="Unlimited"
                      min="2"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="team_budget">Team Budget</Label>
                    <Input 
                      id="team_budget" 
                      name="team_budget" 
                      type="number" 
                      defaultValue={FANTASY_TEAM_BUDGET}
                      required 
                    />
                  </div>
                  <div>
                    <Label htmlFor="payout_structure">Payout Structure</Label>
                    <Select name="payout_structure" defaultValue="top_3_split">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="winner_takes_all">Winner Takes All</SelectItem>
                        <SelectItem value="top_3_split">Top 3 Split (50/30/20)</SelectItem>
                        <SelectItem value="top_5_split">Top 5 Split</SelectItem>
                        <SelectItem value="top_10_split">Top 10 Split</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                  {createMutation.isPending ? 'Creating...' : 'Create League'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Loading fantasy leagues...</p>
            </CardContent>
          </Card>
        ) : pots && pots.length > 0 ? (
          <div className="grid gap-4">
            {pots.map((pot) => (
              <Card key={pot.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Crown className="w-5 h-5 text-primary" />
                        {pot.name}
                        {pot.pot_type === 'season' && (
                          <Badge variant="outline" className="ml-2">Season</Badge>
                        )}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {pot.pot_type === 'season' 
                          ? 'All Tournaments (Season League)' 
                          : pot.tournament 
                            ? `${pot.tournament.name} • ${pot.tournament.location}` 
                            : 'No Tournament Linked'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {pot.status === 'open' && pot.tournament_id && (
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => scoreFantasyMutation.mutate(pot.id)}
                          disabled={scoreFantasyMutation.isPending}
                          title="Score Fantasy"
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="icon"
                        onClick={() => handleEdit(pot)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          if (confirm('Are you sure you want to delete this league?')) {
                            deleteMutation.mutate(pot.id);
                          }
                        }}
                        disabled={deleteMutation.isPending || (pot.entrant_count || 0) > 0}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <Coins className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-xs text-muted-foreground">Entry Fee</p>
                      <p className="font-bold">{pot.entry_fee_tokens.toLocaleString()}</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <Users className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-xs text-muted-foreground">Entrants</p>
                      <p className="font-bold">{pot.entrant_count || 0}{pot.max_entrants ? `/${pot.max_entrants}` : ''}</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <Trophy className="w-5 h-5 mx-auto mb-1 text-primary" />
                      <p className="text-xs text-muted-foreground">Prize Pool</p>
                      <p className="font-bold">{((pot.entrant_count || 0) * pot.entry_fee_tokens * (1 - pot.house_rake_percent / 100)).toLocaleString()}</p>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">House Rake</p>
                      <p className="font-bold">{((pot.entrant_count || 0) * pot.entry_fee_tokens * pot.house_rake_percent / 100).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge className={`${getStatusColor(pot.status)} text-white`}>
                      {pot.status}
                    </Badge>
                    <Badge variant="outline">{pot.visibility}</Badge>
                    <Badge variant="outline">{pot.pot_type}</Badge>
                    {pot.discipline_scope?.map(d => (
                      <Badge key={d} variant="secondary" className="capitalize">{d}</Badge>
                    ))}
                    {pot.invite_code && (
                      <Badge variant="outline" className="font-mono">
                        Code: {pot.invite_code}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 text-center">
              <Crown className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No fantasy leagues created yet</p>
              <Button className="mt-4" onClick={() => setOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create First League
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Fantasy League</DialogTitle>
          </DialogHeader>
          {editingPot && (
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <Label htmlFor="edit-name">League Name</Label>
                <Input id="edit-name" name="name" defaultValue={editingPot.name} required />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-pot_type">Type</Label>
                  <Select name="pot_type" defaultValue={editingPot.pot_type}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tournament">Tournament</SelectItem>
                      <SelectItem value="season">Season</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-visibility">Visibility</Label>
                  <Select name="visibility" defaultValue={editingPot.visibility}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="public">Public</SelectItem>
                      <SelectItem value="private">Private</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="edit-tournament_id">Linked Tournament</Label>
                <Select name="tournament_id" defaultValue={editingPot.tournament_id || 'none'}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tournament" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No tournament</SelectItem>
                    {tournaments?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.location})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-entry_fee_tokens">Entry Fee (tokens)</Label>
                  <Input 
                    id="edit-entry_fee_tokens" 
                    name="entry_fee_tokens" 
                    type="number" 
                    defaultValue={editingPot.entry_fee_tokens}
                    min="0"
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="edit-max_entrants">Max Entrants</Label>
                  <Input 
                    id="edit-max_entrants" 
                    name="max_entrants" 
                    type="number" 
                    defaultValue={editingPot.max_entrants || ''}
                    placeholder="Unlimited"
                    min="2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-team_budget">Team Budget</Label>
                  <Input 
                    id="edit-team_budget" 
                    name="team_budget" 
                    type="number" 
                    defaultValue={editingPot.team_budget}
                    required 
                  />
                </div>
                <div>
                  <Label htmlFor="edit-status">Status</Label>
                  <Select name="status" defaultValue={editingPot.status}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="locked">Locked</SelectItem>
                      <SelectItem value="settled">Settled</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="edit-payout_structure">Payout Structure</Label>
                <Select name="payout_structure" defaultValue={editingPot.payout_structure}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="winner_takes_all">Winner Takes All</SelectItem>
                    <SelectItem value="top_3_split">Top 3 Split (50/30/20)</SelectItem>
                    <SelectItem value="top_5_split">Top 5 Split</SelectItem>
                    <SelectItem value="top_10_split">Top 10 Split</SelectItem>
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
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
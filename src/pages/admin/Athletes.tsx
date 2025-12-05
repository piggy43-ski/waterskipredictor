import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Eye, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';

type Athlete = {
  id: string;
  name: string;
  country: string;
  gender: string;
  disciplines: string[];
  federation: string;
  current_rank_slalom?: number;
  current_rank_trick?: number;
  current_rank_jump?: number;
};

export default function AdminAthletes() {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingAthlete, setEditingAthlete] = useState<Athlete | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('all');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [formDisciplines, setFormDisciplines] = useState<string[]>([]);
  const [rankSlalom, setRankSlalom] = useState<string>('');
  const [rankTrick, setRankTrick] = useState<string>('');
  const [rankJump, setRankJump] = useState<string>('');
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
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (athleteData: any) => {
      const { error } = await supabase.from('athletes').insert(athleteData);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-athletes'] });
      setOpen(false);
      setFormDisciplines([]);
      setRankSlalom('');
      setRankTrick('');
      setRankJump('');
      toast({ title: 'Athlete created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating athlete', description: error.message, variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (athleteData: any) => {
      const { id, ...updates } = athleteData;
      const { error } = await supabase
        .from('athletes')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-athletes'] });
      setEditOpen(false);
      setEditingAthlete(null);
      setFormDisciplines([]);
      setRankSlalom('');
      setRankTrick('');
      setRankJump('');
      toast({ title: 'Athlete updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating athlete', description: error.message, variant: 'destructive' });
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

  const clearAllMutation = useMutation({
    mutationFn: async () => {
      await supabase.from('athlete_rankings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const { error } = await supabase.from('athletes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-athletes'] });
      toast({ title: 'All athletes cleared successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error clearing athletes', description: error.message, variant: 'destructive' });
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    const athleteData: any = {
      name: formData.get('name') as string,
      country: formData.get('country') as string,
      gender: formData.get('gender') as string,
      disciplines: formDisciplines,
      federation: formData.get('federation') as string,
      year_of_birth: parseInt(formData.get('year_of_birth') as string),
    };

    if (formDisciplines.includes('slalom') && rankSlalom) {
      athleteData.current_rank_slalom = parseInt(rankSlalom);
    }
    if (formDisciplines.includes('trick') && rankTrick) {
      athleteData.current_rank_trick = parseInt(rankTrick);
    }
    if (formDisciplines.includes('jump') && rankJump) {
      athleteData.current_rank_jump = parseInt(rankJump);
    }
    
    createMutation.mutate(athleteData);
  };

  const handleEdit = (athlete: Athlete) => {
    setEditingAthlete(athlete);
    setFormDisciplines(athlete.disciplines || []);
    setRankSlalom(athlete.current_rank_slalom?.toString() || '');
    setRankTrick(athlete.current_rank_trick?.toString() || '');
    setRankJump(athlete.current_rank_jump?.toString() || '');
    setEditOpen(true);
  };

  const handleEditSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingAthlete) return;
    
    const formData = new FormData(e.currentTarget);
    
    const athleteData: any = {
      id: editingAthlete.id,
      name: formData.get('name') as string,
      country: formData.get('country') as string,
      gender: formData.get('gender') as string,
      disciplines: formDisciplines,
      federation: formData.get('federation') as string,
      year_of_birth: parseInt(formData.get('year_of_birth') as string),
    };

    if (formDisciplines.includes('slalom') && rankSlalom) {
      athleteData.current_rank_slalom = parseInt(rankSlalom);
    }
    if (formDisciplines.includes('trick') && rankTrick) {
      athleteData.current_rank_trick = parseInt(rankTrick);
    }
    if (formDisciplines.includes('jump') && rankJump) {
      athleteData.current_rank_jump = parseInt(rankJump);
    }
    
    updateMutation.mutate(athleteData);
  };

  const filteredAthletes = athletes?.filter(athlete => {
    const matchesSearch = athlete.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         athlete.country.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDiscipline = filterDiscipline === 'all' || 
      athlete.disciplines?.some((d: string) => d === filterDiscipline);
    const matchesGender = filterGender === 'all' || athlete.gender === filterGender;
    return matchesSearch && matchesDiscipline && matchesGender;
  });

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Athletes</h2>
            <p className="text-muted-foreground mt-1">
              Manage athlete profiles ({athletes?.length || 0} total)
            </p>
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={async () => {
                toast({ title: 'Seeding athlete stats...', description: 'This may take a moment.' });
                try {
                  const { data, error } = await supabase.functions.invoke('seed-athlete-stats');
                  if (error) throw error;
                  queryClient.invalidateQueries({ queryKey: ['admin-athletes'] });
                  toast({ 
                    title: 'Seeding complete!', 
                    description: `Updated ${data?.updated || 0} athletes with tiers and pricing.` 
                  });
                } catch (err: any) {
                  toast({ 
                    title: 'Seeding failed', 
                    description: err.message, 
                    variant: 'destructive' 
                  });
                }
              }}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Seed Stats & Prices
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <AlertTriangle className="w-4 h-4 mr-2" />
                  Clear All Athletes
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all {athletes?.length || 0} athletes and their ranking history.
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => clearAllMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete All Athletes
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Dialog open={open} onOpenChange={(newOpen) => {
              setOpen(newOpen);
              if (!newOpen) {
                setFormDisciplines([]);
                setRankSlalom('');
                setRankTrick('');
                setRankJump('');
              }
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Athlete
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                    <Input id="year_of_birth" name="year_of_birth" type="number" defaultValue="1990" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Disciplines</Label>
                    <div className="flex gap-4">
                      {['slalom', 'trick', 'jump'].map((disc) => (
                        <div key={disc} className="flex items-center space-x-2">
                          <Checkbox
                            id={`create-${disc}`}
                            checked={formDisciplines.includes(disc)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setFormDisciplines([...formDisciplines, disc]);
                              } else {
                                setFormDisciplines(formDisciplines.filter(d => d !== disc));
                              }
                            }}
                          />
                          <label htmlFor={`create-${disc}`} className="capitalize cursor-pointer">
                            {disc}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {formDisciplines.includes('slalom') && (
                    <div>
                      <Label htmlFor="rank_slalom">Slalom Rank</Label>
                      <Input 
                        id="rank_slalom" 
                        type="number" 
                        value={rankSlalom}
                        onChange={(e) => setRankSlalom(e.target.value)}
                      />
                    </div>
                  )}

                  {formDisciplines.includes('trick') && (
                    <div>
                      <Label htmlFor="rank_trick">Trick Rank</Label>
                      <Input 
                        id="rank_trick" 
                        type="number"
                        value={rankTrick}
                        onChange={(e) => setRankTrick(e.target.value)}
                      />
                    </div>
                  )}

                  {formDisciplines.includes('jump') && (
                    <div>
                      <Label htmlFor="rank_jump">Jump Rank</Label>
                      <Input 
                        id="rank_jump" 
                        type="number"
                        value={rankJump}
                        onChange={(e) => setRankJump(e.target.value)}
                      />
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Creating...' : 'Create Athlete'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Input
                placeholder="Search by name or country..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              
              <Select value={filterDiscipline} onValueChange={setFilterDiscipline}>
                <SelectTrigger>
                  <SelectValue placeholder="All Disciplines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Disciplines</SelectItem>
                  <SelectItem value="slalom">Slalom</SelectItem>
                  <SelectItem value="trick">Trick</SelectItem>
                  <SelectItem value="jump">Jump</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterGender} onValueChange={setFilterGender}>
                <SelectTrigger>
                  <SelectValue placeholder="All Genders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                </SelectContent>
              </Select>

              <Button variant="outline" onClick={() => { setSearchQuery(''); setFilterDiscipline('all'); setFilterGender('all'); }}>
                Clear Filters
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">Loading athletes...</p>
            </CardContent>
          </Card>
        ) : filteredAthletes && filteredAthletes.length > 0 ? (
          <div className="grid gap-4">
            {filteredAthletes.map((athlete) => (
              <Card key={athlete.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>{athlete.name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {athlete.country} • {athlete.federation}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link to={`/admin/athletes/${athlete.id}`}>
                        <Button variant="outline" size="icon">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleEdit(athlete)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => deleteMutation.mutate(athlete.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge variant="secondary">
                        {athlete.gender}
                      </Badge>
                      {athlete.disciplines?.map((disc) => (
                        <Badge key={disc} variant="outline" className="capitalize">
                          {disc}
                        </Badge>
                      ))}
                      {athlete.current_rank_slalom && (
                        <Badge>S: {athlete.current_rank_slalom}</Badge>
                      )}
                      {athlete.current_rank_trick && (
                        <Badge>T: {athlete.current_rank_trick}</Badge>
                      )}
                      {athlete.current_rank_jump && (
                        <Badge>J: {athlete.current_rank_jump}</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-6">
              <p className="text-muted-foreground">No athletes found. Use Rankings Import to add athletes or create them manually.</p>
            </CardContent>
          </Card>
        )}

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setEditingAthlete(null);
            setFormDisciplines([]);
            setRankSlalom('');
            setRankTrick('');
            setRankJump('');
          } else if (editingAthlete) {
            setFormDisciplines(editingAthlete.disciplines || []);
            setRankSlalom(editingAthlete.current_rank_slalom?.toString() || '');
            setRankTrick(editingAthlete.current_rank_trick?.toString() || '');
            setRankJump(editingAthlete.current_rank_jump?.toString() || '');
          }
        }}>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Athlete</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <Label htmlFor="edit-name">Name</Label>
                <Input 
                  id="edit-name" 
                  name="name" 
                  defaultValue={editingAthlete?.name} 
                  required 
                />
              </div>
              <div>
                <Label htmlFor="edit-country">Country</Label>
                <Input 
                  id="edit-country" 
                  name="country" 
                  defaultValue={editingAthlete?.country} 
                  required 
                />
              </div>
              <div>
                <Label htmlFor="edit-federation">Federation</Label>
                <Input 
                  id="edit-federation" 
                  name="federation" 
                  defaultValue={editingAthlete?.federation} 
                  required 
                />
              </div>
              <div>
                <Label htmlFor="edit-gender">Gender</Label>
                <Select name="gender" defaultValue={editingAthlete?.gender} required>
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
                <Label htmlFor="edit-year-of-birth">Year of Birth</Label>
                <Input 
                  id="edit-year-of-birth" 
                  name="year_of_birth" 
                  type="number" 
                  defaultValue="1990"
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label>Disciplines</Label>
                <div className="flex gap-4">
                  {['slalom', 'trick', 'jump'].map((disc) => (
                    <div key={disc} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-${disc}`}
                        checked={formDisciplines.includes(disc)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setFormDisciplines([...formDisciplines, disc]);
                          } else {
                            setFormDisciplines(formDisciplines.filter(d => d !== disc));
                          }
                        }}
                      />
                      <label htmlFor={`edit-${disc}`} className="capitalize cursor-pointer">
                        {disc}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {formDisciplines.includes('slalom') && (
                <div>
                  <Label htmlFor="edit-rank-slalom">Slalom Rank</Label>
                  <Input 
                    id="edit-rank-slalom" 
                    type="number"
                    value={rankSlalom}
                    onChange={(e) => setRankSlalom(e.target.value)}
                  />
                </div>
              )}

              {formDisciplines.includes('trick') && (
                <div>
                  <Label htmlFor="edit-rank-trick">Trick Rank</Label>
                  <Input 
                    id="edit-rank-trick" 
                    type="number"
                    value={rankTrick}
                    onChange={(e) => setRankTrick(e.target.value)}
                  />
                </div>
              )}

              {formDisciplines.includes('jump') && (
                <div>
                  <Label htmlFor="edit-rank-jump">Jump Rank</Label>
                  <Input 
                    id="edit-rank-jump" 
                    type="number"
                    value={rankJump}
                    onChange={(e) => setRankJump(e.target.value)}
                  />
                </div>
              )}
              <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Updating...' : 'Update Athlete'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

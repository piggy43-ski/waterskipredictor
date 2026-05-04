import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Trash2, Users } from 'lucide-react';

interface MarketEntry {
  id: string;
  athlete_id: string;
  is_active: boolean;
  athlete: {
    id: string;
    name: string;
    gender: string;
    current_rating_slalom: number | null;
    current_rating_trick: number | null;
    current_rating_jump: number | null;
  };
}

interface Market {
  id: string;
  name: string;
  discipline: string;
  category: string;
  market_type: string;
  tournament: {
    id: string;
    name: string;
  };
}

export default function ContestEntries() {
  const queryClient = useQueryClient();
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [selectedMarket, setSelectedMarket] = useState<string>('');
  const [selectedAthletes, setSelectedAthletes] = useState<string[]>([]);

  // Fetch tournaments
  const { data: tournaments } = useQuery({
    queryKey: ['admin-tournaments-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, status')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch markets for selected tournament
  const { data: markets } = useQuery({
    queryKey: ['admin-markets-entries', selectedTournament],
    queryFn: async () => {
      if (!selectedTournament) return [];
      const { data, error } = await supabase
        .from('markets')
        .select('id, name, discipline, category, market_type, tournament:tournaments(id, name)')
        .eq('tournament_id', selectedTournament);
      if (error) throw error;
      return data as Market[];
    },
    enabled: !!selectedTournament,
  });

  // Fetch current entries for selected market
  const { data: entries, isLoading: entriesLoading } = useQuery({
    queryKey: ['market-entries', selectedMarket],
    queryFn: async () => {
      if (!selectedMarket) return [];
      const { data, error } = await supabase
        .from('market_entries')
        .select('id, athlete_id, is_active, athlete:athletes(id, name, gender, current_rating_slalom, current_rating_trick, current_rating_jump)')
        .eq('market_id', selectedMarket);
      if (error) throw error;
      return data as unknown as MarketEntry[];
    },
    enabled: !!selectedMarket,
  });

  // Fetch available athletes (not already in the market)
  const selectedMarketData = markets?.find(m => m.id === selectedMarket);
  const { data: availableAthletes } = useQuery({
    queryKey: ['available-athletes', selectedMarket, selectedMarketData?.category],
    queryFn: async () => {
      if (!selectedMarket || !selectedMarketData) return [];
      
      const existingAthleteIds = entries?.map(e => e.athlete_id) || [];
      const gender = selectedMarketData.category === 'open_men' ? 'male' : 'female';
      
      let query = supabase
        .from('athletes')
        .select('id, name, gender, current_rating_slalom, current_rating_trick, current_rating_jump')
        .eq('gender', gender)
        .order('name');
      
      if (existingAthleteIds.length > 0) {
        query = query.not('id', 'in', `(${existingAthleteIds.join(',')})`);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!selectedMarket && !!entries,
  });

  // Add athletes to market
  const addAthletesMutation = useMutation({
    mutationFn: async (athleteIds: string[]) => {
      const newEntries = athleteIds.map(athlete_id => ({
        market_id: selectedMarket,
        athlete_id,
        is_active: true,
      }));
      const { error } = await supabase.from('market_entries').insert(newEntries);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-entries', selectedMarket] });
      queryClient.invalidateQueries({ queryKey: ['available-athletes'] });
      setSelectedAthletes([]);
      toast.success('Athletes added to contest');
    },
    onError: (error) => {
      toast.error(`Failed to add athletes: ${error.message}`);
    },
  });

  // Toggle athlete active status
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('market_entries')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-entries', selectedMarket] });
      toast.success('Entry updated');
    },
  });

  // Remove athlete from market
  const removeEntryMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('market_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['market-entries', selectedMarket] });
      queryClient.invalidateQueries({ queryKey: ['available-athletes'] });
      toast.success('Entry removed');
    },
  });

  const getRating = (athlete: MarketEntry['athlete'], discipline: string) => {
    switch (discipline) {
      case 'slalom': return athlete.current_rating_slalom;
      case 'trick': return athlete.current_rating_trick;
      case 'jump': return athlete.current_rating_jump;
      default: return null;
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contest Entries</h1>
          <p className="text-muted-foreground">Manage which athletes are entered in each contest</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Select Contest
            </CardTitle>
            <CardDescription>Choose a tournament and contest to manage entries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tournament</label>
                <Select value={selectedTournament} onValueChange={(v) => { setSelectedTournament(v); setSelectedMarket(''); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tournament" />
                  </SelectTrigger>
                  <SelectContent>
                    {tournaments?.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} <span className="text-muted-foreground">({t.status})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Contest</label>
                <Select value={selectedMarket} onValueChange={setSelectedMarket} disabled={!selectedTournament}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contest" />
                  </SelectTrigger>
                  <SelectContent>
                    {markets?.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedMarket && (
          <>
            {/* Add Athletes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Add Athletes
                </CardTitle>
                <CardDescription>
                  Select athletes to add to this contest ({availableAthletes?.length || 0} available)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto border rounded-lg p-3">
                  {availableAthletes?.map(athlete => (
                    <Badge
                      key={athlete.id}
                      variant={selectedAthletes.includes(athlete.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedAthletes(prev =>
                          prev.includes(athlete.id)
                            ? prev.filter(id => id !== athlete.id)
                            : [...prev, athlete.id]
                        );
                      }}
                    >
                      {athlete.name}
                      {selectedMarketData && (
                        <span className="ml-1 opacity-70">
                          ({getRating(athlete as any, selectedMarketData.discipline) || '?'})
                        </span>
                      )}
                    </Badge>
                  ))}
                  {availableAthletes?.length === 0 && (
                    <p className="text-muted-foreground text-sm">All athletes already added</p>
                  )}
                </div>
                <Button
                  onClick={() => addAthletesMutation.mutate(selectedAthletes)}
                  disabled={selectedAthletes.length === 0 || addAthletesMutation.isPending}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add {selectedAthletes.length} Athletes
                </Button>
              </CardContent>
            </Card>

            {/* Current Entries */}
            <Card>
              <CardHeader>
                <CardTitle>Current Entries ({entries?.length || 0})</CardTitle>
                <CardDescription>
                  Athletes currently entered in this contest
                </CardDescription>
              </CardHeader>
              <CardContent>
                {entriesLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : entries && entries.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Active</TableHead>
                        <TableHead>Athlete</TableHead>
                        <TableHead>Rating</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map(entry => (
                        <TableRow key={entry.id} className={!entry.is_active ? 'opacity-50' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={entry.is_active}
                              onCheckedChange={(checked) =>
                                toggleActiveMutation.mutate({ id: entry.id, is_active: !!checked })
                              }
                            />
                          </TableCell>
                          <TableCell className="font-medium">{entry.athlete.name}</TableCell>
                          <TableCell>
                            {selectedMarketData && getRating(entry.athlete, selectedMarketData.discipline)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeEntryMutation.mutate(entry.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground">No entries yet. Add athletes above.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

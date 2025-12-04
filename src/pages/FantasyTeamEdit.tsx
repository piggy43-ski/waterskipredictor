import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { TeamBuilder } from '@/components/fantasy/TeamBuilder';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FANTASY_ROSTER_LIMITS, getTotalRosterSize } from '@/utils/fantasyConfig';
import { isFantasyPotLocked, type TournamentInfo } from '@/utils/fantasyLockRules';

interface Athlete {
  id: string;
  name: string;
  country: string;
  country_code: string | null;
  disciplines: string[];
  fantasy_price_slalom: number | null;
  fantasy_price_trick: number | null;
  fantasy_price_jump: number | null;
  current_rank_slalom: number | null;
  current_rank_trick: number | null;
  current_rank_jump: number | null;
}

interface RosterSelection {
  athlete: Athlete;
  discipline: 'slalom' | 'trick' | 'jump';
  price: number;
}

const FantasyTeamEdit = () => {
  const { potId, entryId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pot, setPot] = useState<any>(null);
  const [entry, setEntry] = useState<any>(null);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [roster, setRoster] = useState<RosterSelection[]>([]);
  const [teamName, setTeamName] = useState('');

  const budget = pot?.team_budget || 100000;
  const usedBudget = roster.reduce((sum, r) => sum + r.price, 0);
  const remainingBudget = budget - usedBudget;

  useEffect(() => {
    if (user && potId && entryId) fetchData();
  }, [user, potId, entryId]);

  const fetchData = async () => {
    try {
      // Fetch pot details
      const { data: potData, error: potError } = await supabase
        .from('fantasy_pots')
        .select(`*, tournament:tournaments(id, name, start_datetime, end_datetime, start_date)`)
        .eq('id', potId)
        .single();

      if (potError) throw potError;

      // Check if locked
      const tournamentInfo: TournamentInfo | null = potData.tournament ? {
        id: potData.tournament.id,
        start_datetime: potData.tournament.start_datetime,
        end_datetime: potData.tournament.end_datetime,
        start_date: potData.tournament.start_date
      } : null;

      if (isFantasyPotLocked({ id: potData.id, status: potData.status, pot_type: potData.pot_type, tournament_id: potData.tournament_id }, tournamentInfo)) {
        toast({ title: 'Locked', description: 'This league is locked and cannot be edited', variant: 'destructive' });
        navigate(`/fantasy/${potId}/team/${entryId}`);
        return;
      }

      setPot(potData);

      // Fetch entry
      const { data: entryData, error: entryError } = await supabase
        .from('fantasy_entries')
        .select('*')
        .eq('id', entryId)
        .eq('user_id', user!.id)
        .single();

      if (entryError) throw entryError;
      setEntry(entryData);
      setTeamName(entryData.team_name || '');

      // Fetch current roster
      const { data: rosterData } = await supabase
        .from('fantasy_entry_athletes')
        .select(`*, athlete:athletes(*)`)
        .eq('entry_id', entryId);

      const currentRoster: RosterSelection[] = (rosterData || []).map(r => ({
        athlete: r.athlete as Athlete,
        discipline: r.discipline as 'slalom' | 'trick' | 'jump',
        price: r.price_at_selection
      }));
      setRoster(currentRoster);

      // Fetch all athletes
      const { data: athletesData } = await supabase.from('athletes').select('*').order('name');
      const disciplines = potData.discipline_scope || ['slalom', 'trick', 'jump'];
      setAthletes((athletesData || []).filter(a => a.disciplines.some((d: string) => disciplines.includes(d))));

    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'Failed to load team data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const addToRoster = (athlete: Athlete, discipline: 'slalom' | 'trick' | 'jump') => {
    const price = discipline === 'slalom' ? (athlete.fantasy_price_slalom || 5000) : discipline === 'trick' ? (athlete.fantasy_price_trick || 5000) : (athlete.fantasy_price_jump || 5000);
    if (roster.filter(r => r.discipline === discipline).length >= FANTASY_ROSTER_LIMITS[discipline]) {
      toast({ title: 'Roster Full', description: `Max ${FANTASY_ROSTER_LIMITS[discipline]} for ${discipline}`, variant: 'destructive' });
      return;
    }
    if (roster.some(r => r.athlete.id === athlete.id && r.discipline === discipline)) return;
    if (price > remainingBudget) {
      toast({ title: 'Over Budget', description: 'Not enough budget', variant: 'destructive' });
      return;
    }
    setRoster([...roster, { athlete, discipline, price }]);
  };

  const removeFromRoster = (athleteId: string, discipline: string) => {
    setRoster(roster.filter(r => !(r.athlete.id === athleteId && r.discipline === discipline)));
  };

  const saveChanges = async () => {
    if (!entry || roster.length === 0) return;
    setSaving(true);
    try {
      // Delete existing roster
      await supabase.from('fantasy_entry_athletes').delete().eq('entry_id', entry.id);
      
      // Insert new roster
      const rosterInserts = roster.map(r => ({
        entry_id: entry.id,
        athlete_id: r.athlete.id,
        discipline: r.discipline,
        price_at_selection: r.price,
        points_earned: 0
      }));
      await supabase.from('fantasy_entry_athletes').insert(rosterInserts);
      
      // Update entry
      await supabase.from('fantasy_entries').update({ team_name: teamName || 'My Team', total_team_value: usedBudget }).eq('id', entry.id);

      toast({ title: 'Saved!', description: 'Your team has been updated' });
      navigate(`/fantasy/${potId}/team/${entryId}`);
    } catch (error) {
      console.error('Error:', error);
      toast({ title: 'Error', description: 'Failed to save changes', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background pb-20"><PageHeader title="Edit Team" showBack /><div className="text-center py-12 text-muted-foreground">Loading...</div><BottomNav /></div>;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Edit Team" showBack />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Card className="p-4">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">Budget</span>
            <span className={`font-bold ${remainingBudget < 0 ? 'text-destructive' : 'text-primary'}`}>
              {remainingBudget.toLocaleString()} / {budget.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min(100, (usedBudget / budget) * 100)}%` }} />
          </div>
        </Card>

        <div>
          <Label>Team Name</Label>
          <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="My Team" className="mt-1" />
        </div>

        {pot && (
          <TeamBuilder
            athletes={athletes}
            roster={roster}
            disciplines={pot.discipline_scope as ('slalom' | 'trick' | 'jump')[]}
            remainingBudget={remainingBudget}
            onAddAthlete={addToRoster}
            onRemoveAthlete={removeFromRoster}
          />
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />Cancel
          </Button>
          <Button className="flex-1" onClick={saveChanges} disabled={saving || roster.length === 0}>
            <Save className="w-4 h-4 mr-2" />{saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default FantasyTeamEdit;

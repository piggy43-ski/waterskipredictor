import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { TournamentCard } from '@/components/TournamentCard';
import { supabase } from '@/integrations/supabase/client';
import { Tournament } from '@/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { applyDynamicStatus } from '@/utils/tournamentStatus';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Radio, Trophy } from 'lucide-react';

const Tournaments = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .order('start_datetime', { ascending: true });

      if (error) throw error;

      const mappedTournaments: Tournament[] = (data || []).map(t => 
        applyDynamicStatus({
          id: t.id,
          name: t.name,
          location: t.location,
          start_date: t.start_date,
          end_date: t.end_date,
          start_datetime: t.start_datetime,
          end_datetime: t.end_datetime,
          disciplines: t.disciplines as Array<'slalom' | 'trick' | 'jump'>,
          status: t.status as 'upcoming' | 'live' | 'finished',
          settled_at: t.settled_at
        })
      );

      setTournaments(mappedTournaments);
    } catch (error) {
      toast({
        title: "Error loading tournaments",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const upcomingTournaments = tournaments.filter(t => t.status === 'upcoming');
  const liveTournaments = tournaments.filter(t => t.status === 'live');
  const finishedTournaments = tournaments.filter(t => t.status === 'finished');

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Tournaments" />
      
      <div className="max-w-lg mx-auto px-4 py-6">
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-6">
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="live">Live</TabsTrigger>
            <TabsTrigger value="finished">Finished</TabsTrigger>
          </TabsList>
          
          <TabsContent value="upcoming" className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : upcomingTournaments.length > 0 ? (
              upcomingTournaments.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))
            ) : (
              <Card className="p-6 text-center">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-semibold mb-2">No Upcoming Tournaments</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  New tournaments will be announced soon. Check back later or view past events.
                </p>
                {finishedTournaments.length > 0 && (
                  <Button variant="outline" onClick={() => document.querySelector<HTMLButtonElement>('[value="finished"]')?.click()}>
                    View Past Events
                  </Button>
                )}
              </Card>
            )}
          </TabsContent>
          
          <TabsContent value="live" className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : liveTournaments.length > 0 ? (
              liveTournaments.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))
            ) : (
              <Card className="p-6 text-center">
                <Radio className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-semibold mb-2">No Live Events Right Now</h3>
                <p className="text-sm text-muted-foreground">
                  There are no tournaments in progress at the moment. Check the upcoming schedule to see what's next.
                </p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="finished" className="space-y-3">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : finishedTournaments.length > 0 ? (
              finishedTournaments.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))
            ) : (
              <Card className="p-6 text-center">
                <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="font-semibold mb-2">No Finished Tournaments Yet</h3>
                <p className="text-sm text-muted-foreground">
                  Tournament results will appear here once events are completed.
                </p>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Info Section */}
        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>New tournaments will be added throughout the season.</p>
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Tournaments;

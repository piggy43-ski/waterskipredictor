import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { TournamentCard } from '@/components/TournamentCard';
import { mockTournaments } from '@/lib/mockData';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const Tournaments = () => {
  const upcomingTournaments = mockTournaments.filter(t => t.status === 'upcoming');
  const liveTournaments = mockTournaments.filter(t => t.status === 'live');
  const finishedTournaments = mockTournaments.filter(t => t.status === 'finished');

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
            {upcomingTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </TabsContent>
          
          <TabsContent value="live" className="space-y-3">
            {liveTournaments.length > 0 ? (
              liveTournaments.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No live tournaments at the moment
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="finished" className="space-y-3">
            {finishedTournaments.length > 0 ? (
              finishedTournaments.map((tournament) => (
                <TournamentCard key={tournament.id} tournament={tournament} />
              ))
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No finished tournaments yet
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
};

export default Tournaments;

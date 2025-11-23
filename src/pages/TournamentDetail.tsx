import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { SelectionCard } from '@/components/SelectionCard';
import { PredictionDialog } from '@/components/PredictionDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { mockTournaments, mockSelections, mockMarkets } from '@/lib/mockData';
import { Selection } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Calendar, MapPin } from 'lucide-react';

const TournamentDetail = () => {
  const { id } = useParams();
  const { toast } = useToast();
  const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const tournament = mockTournaments.find(t => t.id === id);
  
  if (!tournament) {
    return <div>Tournament not found</div>;
  }

  const markets = mockMarkets.filter(m => m.tournament_id === tournament.id);
  const menMarkets = markets.filter(m => m.category === 'open_men');
  const womenMarkets = markets.filter(m => m.category === 'open_women');

  const handleSelectSelection = (selection: Selection) => {
    setSelectedSelection(selection);
    setDialogOpen(true);
  };

  const handleConfirmPrediction = (stakeAmount: number) => {
    toast({
      title: "Prediction Placed!",
      description: `You've staked ${stakeAmount} tokens on ${selectedSelection?.athlete.name}`,
    });
    setDialogOpen(false);
    setSelectedSelection(null);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader 
        title={tournament.name} 
        subtitle={tournament.location}
        showBack 
      />
      
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Tournament Info */}
        <div className="mb-6 space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{tournament.location}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>
              {formatDate(tournament.start_date)} - {formatDate(tournament.end_date)}
            </span>
          </div>
        </div>

        {/* Markets by Discipline */}
        <Tabs defaultValue="slalom" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-6">
            {tournament.disciplines.map((disc) => (
              <TabsTrigger key={disc} value={disc} className="capitalize">
                {disc}
              </TabsTrigger>
            ))}
          </TabsList>

          {tournament.disciplines.map((discipline) => (
            <TabsContent key={discipline} value={discipline}>
              <Tabs defaultValue="men" className="w-full">
                <TabsList className="w-full grid grid-cols-2 mb-4">
                  <TabsTrigger value="men">Men</TabsTrigger>
                  <TabsTrigger value="women">Women</TabsTrigger>
                </TabsList>

                <TabsContent value="men" className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                    Winner Market
                  </h3>
                  {mockSelections
                    .filter(s => {
                      const market = mockMarkets.find(m => m.id === s.market_id);
                      return market?.discipline === discipline && market?.category === 'open_men';
                    })
                    .map((selection) => (
                      <SelectionCard
                        key={selection.id}
                        selection={selection}
                        onSelect={handleSelectSelection}
                      />
                    ))}
                </TabsContent>

                <TabsContent value="women" className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground mb-3">
                    Winner Market
                  </h3>
                  {mockSelections
                    .filter(s => {
                      const market = mockMarkets.find(m => m.id === s.market_id);
                      return market?.discipline === discipline && market?.category === 'open_women';
                    })
                    .map((selection) => (
                      <SelectionCard
                        key={selection.id}
                        selection={selection}
                        onSelect={handleSelectSelection}
                      />
                    ))}
                </TabsContent>
              </Tabs>
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <PredictionDialog
        selection={selectedSelection}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleConfirmPrediction}
      />

      <BottomNav />
    </div>
  );
};

export default TournamentDetail;

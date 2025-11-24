import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { SelectionCard } from '@/components/SelectionCard';
import { PredictionDialog } from '@/components/PredictionDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Selection, Tournament, Market } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { Calendar, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

const TournamentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedSelection, setSelectedSelection] = useState<Selection | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchTournamentData();
    fetchWalletBalance();
  }, [user, navigate, id]);

  const fetchTournamentData = async () => {
    try {
      // Fetch tournament
      const { data: tournamentData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();

      if (tournamentError) throw tournamentError;

      if (tournamentData) {
        setTournament({
          id: tournamentData.id,
          name: tournamentData.name,
          location: tournamentData.location,
          start_date: tournamentData.start_date,
          end_date: tournamentData.end_date,
          disciplines: tournamentData.disciplines as Array<'slalom' | 'trick' | 'jump'>,
          status: tournamentData.status as 'upcoming' | 'live' | 'finished'
        });

        // Fetch markets
        const { data: marketsData, error: marketsError } = await supabase
          .from('markets')
          .select('*')
          .eq('tournament_id', id);

        if (marketsError) throw marketsError;

        const mappedMarkets: Market[] = (marketsData || []).map(m => ({
          id: m.id,
          tournament_id: m.tournament_id,
          discipline: m.discipline as 'slalom' | 'trick' | 'jump',
          category: m.category as 'open_men' | 'open_women',
          market_type: m.market_type as 'WINNER' | 'PODIUM' | 'HEAD_TO_HEAD' | 'OVER_UNDER',
          name: m.name
        }));

        setMarkets(mappedMarkets);

        // Fetch selections with athletes
        if (marketsData && marketsData.length > 0) {
          const marketIds = marketsData.map(m => m.id);
          const { data: selectionsData, error: selectionsError } = await supabase
            .from('selections')
            .select(`
              *,
              athlete:athletes (
                id,
                name,
                gender,
                country,
                federation,
                year_of_birth,
                disciplines
              )
            `)
            .in('market_id', marketIds);

          if (selectionsError) throw selectionsError;

          const mappedSelections: Selection[] = (selectionsData || []).map((s: any) => ({
            id: s.id,
            market_id: s.market_id,
            athlete_id: s.athlete_id,
            athlete: {
              id: s.athlete.id,
              name: s.athlete.name,
              gender: s.athlete.gender as 'male' | 'female',
              country: s.athlete.country,
              federation: s.athlete.federation,
              year_of_birth: s.athlete.year_of_birth,
              disciplines: s.athlete.disciplines as Array<'slalom' | 'trick' | 'jump'>
            },
            description: s.description,
            decimal_odds: parseFloat(s.decimal_odds)
          }));

          setSelections(mappedSelections);
        }
      }
    } catch (error) {
      toast({
        title: "Error loading tournament",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWalletBalance = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('token_wallets')
      .select('purchased_tokens, earned_tokens')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      toast({
        title: "Error loading wallet",
        description: "Please try again later",
        variant: "destructive"
      });
      return;
    }

    if (data) {
      setWalletBalance(data.purchased_tokens + data.earned_tokens);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Tournament" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading...
        </div>
        <BottomNav />
      </div>
    );
  }
  
  if (!tournament) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="Tournament" showBack />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Tournament not found
        </div>
        <BottomNav />
      </div>
    );
  }

  const menMarkets = markets.filter(m => m.category === 'open_men');
  const womenMarkets = markets.filter(m => m.category === 'open_women');

  const handleSelectSelection = (selection: Selection) => {
    setSelectedSelection(selection);
    setDialogOpen(true);
  };

  const handleConfirmPrediction = async (stakeAmount: number) => {
    if (!user || !selectedSelection) return;

    const market = markets.find(m => m.id === selectedSelection.market_id);
    if (!market) return;

    const potentialPayout = Math.floor(stakeAmount * selectedSelection.decimal_odds);

    try {
      // Insert prediction
      const { error: predictionError } = await supabase
        .from('predictions')
        .insert({
          user_id: user.id,
          selection_id: selectedSelection.id,
          athlete_name: selectedSelection.athlete.name,
          tournament_name: tournament?.name || '',
          discipline: market.discipline,
          category: market.category,
          market_type: market.market_type,
          staked_tokens: stakeAmount,
          decimal_odds: selectedSelection.decimal_odds,
          potential_payout: potentialPayout,
          status: 'PENDING'
        });

      if (predictionError) throw predictionError;

      // Update wallet - deduct from purchased_tokens first
      const { data: walletData, error: walletFetchError } = await supabase
        .from('token_wallets')
        .select('purchased_tokens, earned_tokens')
        .eq('user_id', user.id)
        .maybeSingle();

      if (walletFetchError) throw walletFetchError;
      if (!walletData) return;

      const newPurchasedTokens = Math.max(0, walletData.purchased_tokens - stakeAmount);
      const remaining = stakeAmount - walletData.purchased_tokens;
      const newEarnedTokens = remaining > 0 ? walletData.earned_tokens - remaining : walletData.earned_tokens;

      const { error: walletUpdateError } = await supabase
        .from('token_wallets')
        .update({
          purchased_tokens: newPurchasedTokens,
          earned_tokens: Math.max(0, newEarnedTokens)
        })
        .eq('user_id', user.id);

      if (walletUpdateError) throw walletUpdateError;

      toast({
        title: "Prediction Placed!",
        description: `You've staked ${stakeAmount} tokens on ${selectedSelection?.athlete.name}`,
      });

      await fetchWalletBalance();
      setDialogOpen(false);
      setSelectedSelection(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to place prediction. Please try again.",
        variant: "destructive"
      });
    }
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
                  {selections
                    .filter(s => {
                      const market = markets.find(m => m.id === s.market_id);
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
                  {selections
                    .filter(s => {
                      const market = markets.find(m => m.id === s.market_id);
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
        walletBalance={walletBalance}
      />

      <BottomNav />
    </div>
  );
};

export default TournamentDetail;

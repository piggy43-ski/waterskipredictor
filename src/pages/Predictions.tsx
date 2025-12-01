import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Coins, TrendingUp, Calendar, ChevronDown } from 'lucide-react';
import { decimalToAmerican } from '@/utils/oddsConverter';

interface BetSlip {
  id: string;
  type: 'single' | 'parlay';
  tournament_id: string;
  total_stake_tokens: number;
  total_odds_american: number;
  total_odds_decimal: number;
  status: string;
  potential_payout_tokens: number;
  actual_payout_tokens?: number;
  leg_count: number;
  created_at: string;
  settled_at?: string;
  tournament_name?: string;
  legs?: Prediction[];
}

interface Prediction {
  id: string;
  athlete_name: string;
  tournament_name: string;
  discipline: string;
  category: string;
  market_type: string;
  decimal_odds: number;
  status: string;
}

const Predictions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeBetSlips, setActiveBetSlips] = useState<BetSlip[]>([]);
  const [completedBetSlips, setCompletedBetSlips] = useState<BetSlip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchBetSlips();
  }, [user, navigate]);

  const fetchBetSlips = async () => {
    if (!user) return;

    try {
      // Fetch all bet slips
      const { data: slips, error: slipsError } = await supabase
        .from('bet_slips')
        .select(`
          *,
          tournaments (name)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (slipsError) throw slipsError;

      if (slips) {
        // Fetch legs for each slip
        const slipsWithLegs = await Promise.all(
          slips.map(async (slip: any) => {
            const { data: legs } = await supabase
              .from('predictions')
              .select('*')
              .eq('bet_slip_id', slip.id)
              .order('created_at', { ascending: true });

            return {
              ...slip,
              tournament_name: slip.tournaments?.name || 'Unknown Tournament',
              legs: legs || []
            };
          })
        );

        const active = slipsWithLegs.filter(s => s.status === 'PENDING');
        const completed = slipsWithLegs.filter(s => s.status !== 'PENDING');
        
        setActiveBetSlips(active);
        setCompletedBetSlips(completed);
      }
    } catch (error) {
      toast({
        title: "Error loading bets",
        description: "Please try again later",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'WON':
        return <Badge className="bg-success text-success-foreground">Won</Badge>;
      case 'LOST':
        return <Badge variant="destructive">Lost</Badge>;
      case 'VOID':
        return <Badge variant="secondary">Void</Badge>;
      case 'PENDING':
        return <Badge variant="outline">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const BetSlipCard = ({ slip, isActive }: { slip: BetSlip; isActive: boolean }) => {
    const isParlayDisplay = slip.type === 'parlay' || slip.leg_count > 1;
    const americanOdds = decimalToAmerican(slip.total_odds_decimal);
    
    return (
      <Card className="p-4 hover:shadow-glow transition-all">
        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg">
                  {isParlayDisplay ? `Parlay (${slip.leg_count} legs)` : slip.legs?.[0]?.athlete_name || 'Single Bet'}
                </h3>
                {isParlayDisplay && (
                  <Badge variant="secondary" className="text-xs">Parlay</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{slip.tournament_name}</p>
              {!isParlayDisplay && slip.legs?.[0] && (
                <p className="text-xs text-muted-foreground capitalize">
                  {slip.legs[0].discipline} • {slip.legs[0].category.replace('_', ' ')}
                </p>
              )}
            </div>
            {getStatusBadge(slip.status)}
          </div>

          {/* Show legs for parlays */}
          {isParlayDisplay && slip.legs && slip.legs.length > 0 && (
            <Accordion type="single" collapsible className="border-t border-border pt-2">
              <AccordionItem value="legs" className="border-0">
                <AccordionTrigger className="py-2 text-sm text-muted-foreground hover:no-underline">
                  <span className="flex items-center gap-1">
                    View {slip.leg_count} legs
                    <ChevronDown className="w-4 h-4" />
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-2 pt-2">
                  {slip.legs.map((leg, idx) => (
                    <div key={leg.id} className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm">
                      <div className="flex-1">
                        <div className="font-medium">{idx + 1}. {leg.athlete_name}</div>
                        <div className="text-xs text-muted-foreground capitalize">
                          {leg.market_type.replace('_', ' ')} • {leg.discipline}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-primary">
                          {decimalToAmerican(leg.decimal_odds)}
                        </span>
                        {getStatusBadge(leg.status)}
                      </div>
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Stake</p>
              <p className="font-semibold flex items-center gap-1">
                <Coins className="w-4 h-4 text-primary" />
                {slip.total_stake_tokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Odds</p>
              <p className="font-semibold flex items-center gap-1 text-primary">
                <TrendingUp className="w-4 h-4" />
                {americanOdds}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                {isActive ? 'Potential Win' : 'Result'}
              </p>
              <p className={`font-bold ${
                slip.status === 'WON' ? 'text-success' : 
                slip.status === 'LOST' ? 'text-destructive' : 
                'text-primary'
              }`}>
                {isActive ? (
                  `${slip.potential_payout_tokens.toLocaleString()} tokens`
                ) : slip.status === 'WON' ? (
                  `+${slip.actual_payout_tokens?.toLocaleString() || 0} tokens`
                ) : slip.status === 'LOST' ? (
                  `-${slip.total_stake_tokens.toLocaleString()} tokens`
                ) : (
                  'Refunded'
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {isActive ? 'Placed' : 'Settled'}
              </p>
              <p className="text-sm">
                {formatDate(isActive ? slip.created_at : (slip.settled_at || slip.created_at))}
              </p>
            </div>
          </div>
        </div>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <PageHeader title="My Bets" />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading...
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="My Bets" />
      
      <div className="max-w-lg mx-auto px-4 py-6">
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-6">
            <TabsTrigger value="active">
              Active ({activeBetSlips.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              History ({completedBetSlips.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3">
            {activeBetSlips.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No active bets</p>
                <p className="text-sm text-muted-foreground">
                  Browse tournaments and place your first bet!
                </p>
              </Card>
            ) : (
              activeBetSlips.map((slip) => (
                <BetSlipCard key={slip.id} slip={slip} isActive />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {completedBetSlips.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No completed bets yet</p>
                <p className="text-sm text-muted-foreground">
                  Your settled bets will appear here
                </p>
              </Card>
            ) : (
              completedBetSlips.map((slip) => (
                <BetSlipCard key={slip.id} slip={slip} isActive={false} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      <BottomNav />
    </div>
  );
};

export default Predictions;

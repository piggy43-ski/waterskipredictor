import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Coins, TrendingUp, Calendar } from 'lucide-react';
import { decimalToAmerican } from '@/utils/oddsConverter';

interface Prediction {
  id: string;
  athlete_name: string;
  tournament_name: string;
  discipline: string;
  category: string;
  market_type: string;
  staked_tokens: number;
  decimal_odds: number;
  potential_payout: number;
  status: string;
  created_at: string;
  settled_at?: string;
  payout_tokens?: number;
}

const Predictions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [activePredictions, setActivePredictions] = useState<Prediction[]>([]);
  const [completedPredictions, setCompletedPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchPredictions();
  }, [user, navigate]);

  const fetchPredictions = async () => {
    if (!user) return;

    try {
      // Fetch all predictions
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const active = data.filter(p => p.status === 'PENDING');
        const completed = data.filter(p => p.status !== 'PENDING');
        
        setActivePredictions(active);
        setCompletedPredictions(completed);
      }
    } catch (error) {
      toast({
        title: "Error loading predictions",
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

  const PredictionCard = ({ prediction, isActive }: { prediction: Prediction; isActive: boolean }) => {
    const americanOdds = decimalToAmerican(prediction.decimal_odds);
    
    return (
      <Card className="p-4 hover:shadow-glow transition-all">
        <div className="space-y-3">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{prediction.athlete_name}</h3>
              <p className="text-sm text-muted-foreground">{prediction.tournament_name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {prediction.discipline} • {prediction.category.replace('_', ' ')}
              </p>
            </div>
            {getStatusBadge(prediction.status)}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-border">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Stake</p>
              <p className="font-semibold flex items-center gap-1">
                <Coins className="w-4 h-4 text-primary" />
                {prediction.staked_tokens.toLocaleString()}
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
                prediction.status === 'WON' ? 'text-success' : 
                prediction.status === 'LOST' ? 'text-destructive' : 
                'text-primary'
              }`}>
                {isActive ? (
                  `${prediction.potential_payout.toLocaleString()} tokens`
                ) : prediction.status === 'WON' ? (
                  `+${prediction.payout_tokens?.toLocaleString() || 0} tokens`
                ) : prediction.status === 'LOST' ? (
                  `-${prediction.staked_tokens.toLocaleString()} tokens`
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
                {formatDate(isActive ? prediction.created_at : (prediction.settled_at || prediction.created_at))}
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
        <PageHeader title="My Predictions" />
        <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
          Loading...
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="My Predictions" />
      
      <div className="max-w-lg mx-auto px-4 py-6">
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="w-full grid grid-cols-2 mb-6">
            <TabsTrigger value="active">
              Active ({activePredictions.length})
            </TabsTrigger>
            <TabsTrigger value="history">
              History ({completedPredictions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3">
            {activePredictions.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No active predictions</p>
                <p className="text-sm text-muted-foreground">
                  Browse tournaments and place your first bet!
                </p>
              </Card>
            ) : (
              activePredictions.map((prediction) => (
                <PredictionCard key={prediction.id} prediction={prediction} isActive />
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="space-y-3">
            {completedPredictions.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No completed predictions yet</p>
                <p className="text-sm text-muted-foreground">
                  Your settled predictions will appear here
                </p>
              </Card>
            ) : (
              completedPredictions.map((prediction) => (
                <PredictionCard key={prediction.id} prediction={prediction} isActive={false} />
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

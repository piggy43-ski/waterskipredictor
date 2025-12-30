import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatTokensWithUSD, formatTokens } from '@/utils/tokenConversion';
import { format } from 'date-fns';
import { ArrowLeft, TrendingUp, TrendingDown, Trophy, Target, Coins, History } from 'lucide-react';

interface UserAnalyticsDrilldownProps {
  userId: string;
  username: string;
  onBack: () => void;
}

export const UserAnalyticsDrilldown = ({ userId, username, onBack }: UserAnalyticsDrilldownProps) => {
  const [activeTab, setActiveTab] = useState('summary');

  // Fetch user's betting stats
  const { data: bettingStats } = useQuery({
    queryKey: ['user-betting-stats', userId],
    queryFn: async () => {
      const { data: predictions, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId);
      
      if (error) throw error;

      const totalWagered = predictions?.reduce((sum, p) => sum + p.staked_tokens, 0) || 0;
      const settledPredictions = predictions?.filter(p => p.status !== 'PENDING') || [];
      const wonPredictions = settledPredictions.filter(p => p.status === 'WON');
      const lostPredictions = settledPredictions.filter(p => p.status === 'LOST');
      
      const totalPayout = wonPredictions.reduce((sum, p) => sum + (p.payout_tokens || 0), 0);
      const totalLost = lostPredictions.reduce((sum, p) => sum + p.staked_tokens, 0);
      const wonStakes = wonPredictions.reduce((sum, p) => sum + p.staked_tokens, 0);
      
      // Net P/L = total payouts - total wagered on settled bets
      const settledWagered = settledPredictions.reduce((sum, p) => sum + p.staked_tokens, 0);
      const netPL = totalPayout - settledWagered;

      return {
        totalBets: predictions?.length || 0,
        pendingBets: predictions?.filter(p => p.status === 'PENDING').length || 0,
        settledBets: settledPredictions.length,
        wins: wonPredictions.length,
        losses: lostPredictions.length,
        winRate: settledPredictions.length > 0 
          ? ((wonPredictions.length / settledPredictions.length) * 100).toFixed(1)
          : '0',
        totalWagered,
        totalPayout,
        totalLost,
        netPL,
      };
    },
  });

  // Fetch user's predictions with details
  const { data: predictions, isLoading: predictionsLoading } = useQuery({
    queryKey: ['user-predictions-detail', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch user's transaction history
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['user-transactions', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'WON':
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Won</Badge>;
      case 'LOST':
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Lost</Badge>;
      case 'VOID':
        return <Badge variant="secondary">Void</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  const getTransactionBadge = (type: string) => {
    const typeColors: Record<string, string> = {
      'WAGER': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      'bet_placed': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      'bet_won': 'bg-green-500/10 text-green-500 border-green-500/20',
      'bet_lost': 'bg-red-500/10 text-red-500 border-red-500/20',
      'bet_void': 'bg-muted text-muted-foreground',
      'bonus': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      'adjustment': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
      'burn': 'bg-red-500/10 text-red-500 border-red-500/20',
      'fantasy_entry': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      'fantasy_payout': 'bg-green-500/10 text-green-500 border-green-500/20',
    };
    return <Badge className={typeColors[type] || 'bg-muted text-muted-foreground'}>{type.replace('_', ' ')}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Users
        </Button>
        <div>
          <h2 className="text-2xl font-bold">{username}</h2>
          <p className="text-muted-foreground text-sm">User ID: {userId}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Wagered</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTokens(bettingStats?.totalWagered || 0)}</div>
            <p className="text-xs text-muted-foreground">{bettingStats?.totalBets || 0} bets placed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Won</CardTitle>
            <Trophy className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatTokens(bettingStats?.totalPayout || 0)}</div>
            <p className="text-xs text-muted-foreground">{bettingStats?.wins || 0} wins ({bettingStats?.winRate}%)</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Lost</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatTokens(bettingStats?.totalLost || 0)}</div>
            <p className="text-xs text-muted-foreground">{bettingStats?.losses || 0} losses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Net P/L</CardTitle>
            {(bettingStats?.netPL || 0) >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(bettingStats?.netPL || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {(bettingStats?.netPL || 0) >= 0 ? '+' : ''}{formatTokens(bettingStats?.netPL || 0)}
            </div>
            <p className="text-xs text-muted-foreground">{bettingStats?.pendingBets || 0} pending bets</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="summary">
            <Coins className="h-4 w-4 mr-2" />
            Betting Summary
          </TabsTrigger>
          <TabsTrigger value="bets">
            <Target className="h-4 w-4 mr-2" />
            All Bets
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <History className="h-4 w-4 mr-2" />
            Transactions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Betting Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Win Rate</p>
                  <p className="text-2xl font-bold">{bettingStats?.winRate}%</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Settled Bets</p>
                  <p className="text-2xl font-bold">{bettingStats?.settledBets || 0}</p>
                </div>
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm text-muted-foreground">Pending Bets</p>
                  <p className="text-2xl font-bold">{bettingStats?.pendingBets || 0}</p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-lg">
                  <p className="text-sm text-green-600">Total Payouts</p>
                  <p className="text-2xl font-bold text-green-600">{formatTokensWithUSD(bettingStats?.totalPayout || 0)}</p>
                </div>
                <div className="p-4 bg-orange-500/10 rounded-lg">
                  <p className="text-sm text-orange-600">Total Wagered</p>
                  <p className="text-2xl font-bold text-orange-600">{formatTokensWithUSD(bettingStats?.totalWagered || 0)}</p>
                </div>
                <div className={`p-4 rounded-lg ${(bettingStats?.netPL || 0) >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  <p className={`text-sm ${(bettingStats?.netPL || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>Net P/L</p>
                  <p className={`text-2xl font-bold ${(bettingStats?.netPL || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {(bettingStats?.netPL || 0) >= 0 ? '+' : ''}{formatTokensWithUSD(bettingStats?.netPL || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bets" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>All Bets ({predictions?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Tournament</TableHead>
                      <TableHead>Pick</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Stake</TableHead>
                      <TableHead className="text-right">Odds</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="text-right">Payout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {predictionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                      </TableRow>
                    ) : predictions?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No bets found
                        </TableCell>
                      </TableRow>
                    ) : (
                      predictions?.map((pred) => (
                        <TableRow key={pred.id}>
                          <TableCell className="text-sm">
                            {format(new Date(pred.created_at), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell className="max-w-[150px] truncate">{pred.tournament_name}</TableCell>
                          <TableCell className="font-medium">{pred.athlete_name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {pred.market_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatTokens(pred.staked_tokens)}</TableCell>
                          <TableCell className="text-right">{pred.decimal_odds.toFixed(2)}</TableCell>
                          <TableCell>{getStatusBadge(pred.status)}</TableCell>
                          <TableCell className="text-right">
                            {pred.status === 'WON' ? (
                              <span className="text-green-600 font-medium">
                                +{formatTokens(pred.payout_tokens || 0)}
                              </span>
                            ) : pred.status === 'LOST' ? (
                              <span className="text-red-600">-{formatTokens(pred.staked_tokens)}</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Transaction History ({transactions?.length || 0})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance After</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">Loading...</TableCell>
                      </TableRow>
                    ) : transactions?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No transactions found
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions?.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm">
                            {format(new Date(tx.created_at), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>{getTransactionBadge(tx.type)}</TableCell>
                          <TableCell className="max-w-[250px] truncate">{tx.description}</TableCell>
                          <TableCell className="text-right">
                            <span className={tx.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {tx.amount >= 0 ? '+' : ''}{formatTokens(tx.amount)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">{formatTokens(tx.balance_after)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

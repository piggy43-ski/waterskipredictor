import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, AlertTriangle, Shield, TrendingUp, DollarSign, Users, Ban } from 'lucide-react';
import { RISK_CONFIG, getLiabilityCap } from '@/utils/riskConfig';

interface Tournament {
  id: string;
  name: string;
  status: string;
}

interface Market {
  id: string;
  name: string;
  market_type: string;
  discipline: string;
  category: string;
}

interface LiabilityData {
  id: string;
  market_id: string;
  athlete_id: string;
  total_stake_tokens: number;
  total_potential_payout: number;
  bet_count: number;
  liability_if_wins: number;
  athlete?: {
    name: string;
    country: string;
  };
}

interface RiskConfigRow {
  key: string;
  value: string | number | boolean | null;
  description: string | null;
}

const MarketLiability = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string>('');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [selectedMarketId, setSelectedMarketId] = useState<string>('');
  const [liabilityData, setLiabilityData] = useState<LiabilityData[]>([]);
  const [riskConfig, setRiskConfig] = useState<RiskConfigRow[]>([]);

  useEffect(() => {
    fetchTournaments();
    fetchRiskConfig();
  }, []);

  useEffect(() => {
    if (selectedTournamentId) {
      fetchMarkets(selectedTournamentId);
    }
  }, [selectedTournamentId]);

  useEffect(() => {
    if (selectedMarketId) {
      fetchLiabilityData(selectedMarketId);
    }
  }, [selectedMarketId]);

  const fetchTournaments = async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, name, status')
      .in('status', ['upcoming', 'live'])
      .order('start_date', { ascending: false });

    if (error) {
      toast({ title: 'Error loading tournaments', variant: 'destructive' });
      return;
    }

    setTournaments(data || []);
    if (data && data.length > 0) {
      setSelectedTournamentId(data[0].id);
    }
    setLoading(false);
  };

  const fetchMarkets = async (tournamentId: string) => {
    const { data, error } = await supabase
      .from('markets')
      .select('id, name, market_type, discipline, category')
      .eq('tournament_id', tournamentId)
      .order('discipline', { ascending: true });

    if (error) {
      toast({ title: 'Error loading markets', variant: 'destructive' });
      return;
    }

    setMarkets(data || []);
    if (data && data.length > 0) {
      setSelectedMarketId(data[0].id);
    }
  };

  const fetchLiabilityData = async (marketId: string) => {
    const { data, error } = await supabase
      .from('market_liability')
      .select(`
        *,
        athlete:athletes(name, country)
      `)
      .eq('market_id', marketId)
      .order('liability_if_wins', { ascending: false });

    if (error) {
      toast({ title: 'Error loading liability data', variant: 'destructive' });
      return;
    }

    setLiabilityData(data || []);
  };

  const fetchRiskConfig = async () => {
    const { data, error } = await supabase
      .from('risk_config')
      .select('key, value, description');

    if (error) {
      toast({ title: 'Error loading risk config', variant: 'destructive' });
      return;
    }

    setRiskConfig((data || []).map(row => ({
      key: row.key,
      value: typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value),
      description: row.description,
    })));
  };

  const selectedMarket = markets.find(m => m.id === selectedMarketId);
  const marketType = (selectedMarket?.market_type || 'WINNER') as 'WINNER' | 'PODIUM' | 'HIGHEST_SCORE';
  const liabilityCap = getLiabilityCap(marketType);

  // Calculate totals
  const totalHandle = liabilityData.reduce((sum, l) => sum + l.total_stake_tokens, 0);
  const maxLiability = liabilityData.reduce((max, l) => Math.max(max, l.liability_if_wins), 0);
  const totalBets = liabilityData.reduce((sum, l) => sum + l.bet_count, 0);

  const getLiabilityStatus = (liabilityPct: number) => {
    if (liabilityPct >= liabilityCap * 100) return { color: 'destructive', label: 'CAPPED' };
    if (liabilityPct >= liabilityCap * 80) return { color: 'warning', label: 'HIGH' };
    if (liabilityPct >= liabilityCap * 50) return { color: 'default', label: 'MEDIUM' };
    return { color: 'secondary', label: 'LOW' };
  };

  const handleRefresh = () => {
    if (selectedMarketId) {
      fetchLiabilityData(selectedMarketId);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Market Liability</h1>
            <p className="text-muted-foreground">Monitor and manage house exposure per market</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Risk Config Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Max Stake</div>
              <div className="text-2xl font-bold">{RISK_CONFIG.MAX_STAKE.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Max Payout</div>
              <div className="text-2xl font-bold">{RISK_CONFIG.MAX_PAYOUT.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Liability Cap ({marketType})</div>
              <div className="text-2xl font-bold">{Math.round(liabilityCap * 100)}%</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm text-muted-foreground">Max Allocation</div>
              <div className="text-2xl font-bold">{Math.round(RISK_CONFIG.MAX_ATHLETE_ALLOCATION_PCT * 100)}%</div>
            </CardContent>
          </Card>
        </div>

        {/* Market Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Select Market</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Select value={selectedTournamentId} onValueChange={setSelectedTournamentId}>
              <SelectTrigger className="w-[250px]">
                <SelectValue placeholder="Select tournament" />
              </SelectTrigger>
              <SelectContent>
                {tournaments.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedMarketId} onValueChange={setSelectedMarketId}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select market" />
              </SelectTrigger>
              <SelectContent>
                {markets.map(m => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.discipline} - {m.category} - {m.market_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Market Summary */}
        {selectedMarket && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <DollarSign className="w-4 h-4" />
                  Total Handle
                </div>
                <div className="text-2xl font-bold">{totalHandle.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="w-4 h-4" />
                  Max Liability
                </div>
                <div className="text-2xl font-bold text-destructive">{maxLiability.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  Total Bets
                </div>
                <div className="text-2xl font-bold">{totalBets}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="w-4 h-4" />
                  Athletes w/ Bets
                </div>
                <div className="text-2xl font-bold">{liabilityData.length}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Liability Table */}
        {liabilityData.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Athlete Liability</CardTitle>
              <CardDescription>
                Liability cap for {marketType} markets: {Math.round(liabilityCap * 100)}% of handle
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Athlete</TableHead>
                    <TableHead className="text-right">Bets</TableHead>
                    <TableHead className="text-right">Total Stake</TableHead>
                    <TableHead className="text-right">Potential Payout</TableHead>
                    <TableHead className="text-right">Liability if Wins</TableHead>
                    <TableHead className="w-[200px]">Liability %</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liabilityData.map((row) => {
                    const liabilityPct = totalHandle > 0 ? (row.liability_if_wins / totalHandle) * 100 : 0;
                    const status = getLiabilityStatus(liabilityPct);
                    const progressPct = Math.min(100, (liabilityPct / (liabilityCap * 100)) * 100);

                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.athlete?.name || 'Unknown'}
                          <span className="text-muted-foreground text-xs ml-2">
                            {row.athlete?.country}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{row.bet_count}</TableCell>
                        <TableCell className="text-right">{row.total_stake_tokens.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{row.total_potential_payout.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {row.liability_if_wins.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress 
                              value={progressPct} 
                              className={`h-2 ${progressPct >= 80 ? '[&>div]:bg-destructive' : progressPct >= 50 ? '[&>div]:bg-yellow-500' : ''}`}
                            />
                            <span className="text-xs w-12 text-right">{liabilityPct.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.color as any}>
                            {status.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="font-semibold mb-2">No Liability Data</h3>
              <p className="text-sm text-muted-foreground">
                No bets have been placed on this market yet
              </p>
            </CardContent>
          </Card>
        )}

        {/* Risk Config Table */}
        <Card>
          <CardHeader>
            <CardTitle>Risk Configuration</CardTitle>
            <CardDescription>Current platform risk limits</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setting</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskConfig.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell className="font-mono text-sm">{row.key}</TableCell>
                    <TableCell className="font-semibold">{row.value}</TableCell>
                    <TableCell className="text-muted-foreground">{row.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default MarketLiability;
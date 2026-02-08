import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, Filter, Search, Target, TrendingUp, Trophy, Coins } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PredictionWithProfile {
  id: string;
  user_id: string;
  tournament_name: string;
  athlete_name: string;
  market_type: string;
  discipline: string;
  category: string;
  staked_tokens: number;
  decimal_odds: number;
  status: string;
  payout_tokens: number | null;
  created_at: string;
  profiles: {
    username: string | null;
    email: string | null;
  } | null;
}

const STATUS_OPTIONS = ['all', 'PENDING', 'WON', 'LOST', 'VOID', 'CANCELLED'];
const MARKET_TYPES = ['all', 'WINNER', 'PODIUM', 'TOP_5', 'HEAD_TO_HEAD'];

export default function AllPredictions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [marketTypeFilter, setMarketTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: predictions = [], isLoading } = useQuery({
    queryKey: ['admin-all-predictions'],
    queryFn: async () => {
      // Fetch predictions
      const { data: predData, error: predError } = await supabase
        .from('predictions')
        .select('id, user_id, tournament_name, athlete_name, market_type, discipline, category, staked_tokens, decimal_odds, status, payout_tokens, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (predError) throw predError;

      // Get unique user IDs
      const userIds = [...new Set(predData.map(p => p.user_id))];

      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Create lookup map
      const profilesMap = new Map(profilesData.map(p => [p.id, p]));

      // Merge data
      return predData.map(pred => ({
        ...pred,
        profiles: profilesMap.get(pred.user_id) || null,
      })) as PredictionWithProfile[];
    },
  });

  const filteredPredictions = useMemo(() => {
    return predictions.filter((pred) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesUser =
          pred.profiles?.username?.toLowerCase().includes(query) ||
          pred.profiles?.email?.toLowerCase().includes(query);
        const matchesAthlete = pred.athlete_name?.toLowerCase().includes(query);
        const matchesTournament = pred.tournament_name?.toLowerCase().includes(query);
        if (!matchesUser && !matchesAthlete && !matchesTournament) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && pred.status !== statusFilter) return false;

      // Market type filter
      if (marketTypeFilter !== 'all' && pred.market_type !== marketTypeFilter) return false;

      // Date filters
      const predDate = new Date(pred.created_at);
      if (startDate && predDate < startDate) return false;
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (predDate > endOfDay) return false;
      }

      return true;
    });
  }, [predictions, searchQuery, statusFilter, marketTypeFilter, startDate, endDate]);

  const stats = useMemo(() => {
    const total = filteredPredictions.length;
    const won = filteredPredictions.filter((p) => p.status === 'WON').length;
    const settled = filteredPredictions.filter((p) => ['WON', 'LOST'].includes(p.status)).length;
    const totalWagered = filteredPredictions.reduce((sum, p) => sum + p.staked_tokens, 0);
    const totalPaidOut = filteredPredictions
      .filter((p) => p.payout_tokens)
      .reduce((sum, p) => sum + (p.payout_tokens || 0), 0);

    return {
      total,
      winRate: settled > 0 ? ((won / settled) * 100).toFixed(1) : '0',
      totalWagered,
      totalPaidOut,
    };
  }, [filteredPredictions]);

  const exportToCSV = () => {
    const headers = [
      'Date', 'User', 'Email', 'Tournament', 'Athlete', 'Market Type',
      'Discipline', 'Category', 'Stake', 'Multiplier', 'Status', 'Payout'
    ];
    const rows = filteredPredictions.map((pred) => [
      format(new Date(pred.created_at), 'yyyy-MM-dd HH:mm:ss'),
      pred.profiles?.username || 'Unknown',
      pred.profiles?.email || '',
      pred.tournament_name,
      pred.athlete_name,
      pred.market_type,
      pred.discipline,
      pred.category,
      pred.staked_tokens,
      pred.decimal_odds,
      pred.status,
      pred.payout_tokens || 0,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `predictions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setMarketTypeFilter('all');
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'WON':
        return 'default';
      case 'LOST':
        return 'destructive';
      case 'PENDING':
        return 'secondary';
      case 'VOID':
      case 'CANCELLED':
        return 'outline';
      default:
        return 'outline';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">All Predictions</h1>
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="w-4 h-4" />
                Total Predictions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.total.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                Win Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.winRate}%</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Coins className="w-4 h-4" />
                Total Wagered
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.totalWagered.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Total Paid Out
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">{stats.totalPaidOut.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filters
                  {(searchQuery || statusFilter !== 'all' || marketTypeFilter !== 'all' || startDate || endDate) && (
                    <Badge variant="secondary" className="ml-2">Active</Badge>
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search user, athlete, tournament..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status === 'all' ? 'All Statuses' : status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={marketTypeFilter} onValueChange={setMarketTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Market type" />
                    </SelectTrigger>
                    <SelectContent>
                      {MARKET_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type === 'all' ? 'All Market Types' : type.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal">
                        {startDate ? format(startDate, 'MMM d, yyyy') : 'Start date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
                    </PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="justify-start text-left font-normal">
                        {endDate ? format(endDate, 'MMM d, yyyy') : 'End date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={endDate} onSelect={setEndDate} />
                    </PopoverContent>
                  </Popover>
                </div>

                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Loading predictions...</div>
            ) : filteredPredictions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No predictions found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Tournament</TableHead>
                      <TableHead>Athlete</TableHead>
                      <TableHead>Contest</TableHead>
                      <TableHead className="text-right">Stake</TableHead>
                      <TableHead className="text-right">Multiplier</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Payout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPredictions.slice(0, 100).map((pred) => (
                      <TableRow key={pred.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(pred.created_at), 'MMM d, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{pred.profiles?.username || 'Unknown'}</span>
                            <span className="text-xs text-muted-foreground">{pred.profiles?.email}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {pred.tournament_name}
                        </TableCell>
                        <TableCell>{pred.athlete_name}</TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-sm">{pred.market_type.replace(/_/g, ' ')}</span>
                            <span className="text-xs text-muted-foreground">
                              {pred.discipline} • {pred.category}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {pred.staked_tokens.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(pred.decimal_odds).toFixed(2)}x
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(pred.status)}>
                            {pred.status}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn(
                          'text-right font-mono',
                          pred.payout_tokens && pred.payout_tokens > 0 ? 'text-primary' : ''
                        )}>
                          {pred.payout_tokens ? `+${pred.payout_tokens.toLocaleString()}` : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredPredictions.length > 100 && (
                  <div className="p-4 text-center text-sm text-muted-foreground border-t">
                    Showing 100 of {filteredPredictions.length} predictions
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

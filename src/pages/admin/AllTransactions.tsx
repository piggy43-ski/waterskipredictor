import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, Filter, Search, ArrowUpRight, ArrowDownRight, Activity, DollarSign } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { PurchasesTable } from '@/components/admin/PurchasesTable';

interface TransactionWithProfile {
  id: string;
  user_id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
  profiles: {
    username: string | null;
    email: string | null;
  } | null;
}

const TRANSACTION_TYPES = [
  'all',
  'deposit',
  'bonus',
  'win',
  'refund',
  'transfer',
  'burn',
  'reward_redemption',
  'fantasy_entry',
  'fantasy_payout',
  'prediction_won',
  'prediction_lost',
  'prediction_void',
  'entry_placed',
];

export default function AllTransactions() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['admin-all-transactions'],
    queryFn: async () => {
      // First fetch transactions
      const { data: txData, error: txError } = await supabase
        .from('token_transactions')
        .select('id, user_id, type, amount, balance_after, description, created_at')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (txError) throw txError;

      // Get unique user IDs
      const userIds = [...new Set(txData.map(tx => tx.user_id))];

      // Fetch profiles for those users
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, email')
        .in('id', userIds);

      if (profilesError) throw profilesError;

      // Create a lookup map
      const profilesMap = new Map(profilesData.map(p => [p.id, p]));

      // Merge data
      return txData.map(tx => ({
        ...tx,
        profiles: profilesMap.get(tx.user_id) || null,
      })) as TransactionWithProfile[];
    },
  });

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesUser =
          tx.profiles?.username?.toLowerCase().includes(query) ||
          tx.profiles?.email?.toLowerCase().includes(query);
        const matchesDescription = tx.description?.toLowerCase().includes(query);
        if (!matchesUser && !matchesDescription) return false;
      }

      // Type filter
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;

      // Date filters
      const txDate = new Date(tx.created_at);
      if (startDate && txDate < startDate) return false;
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (txDate > endOfDay) return false;
      }

      return true;
    });
  }, [transactions, searchQuery, typeFilter, startDate, endDate]);

  const stats = useMemo(() => {
    const totalInflow = filteredTransactions
      .filter((tx) => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);

    const totalOutflow = filteredTransactions
      .filter((tx) => tx.amount < 0)
      .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

    return {
      total: filteredTransactions.length,
      inflow: totalInflow,
      outflow: totalOutflow,
      net: totalInflow - totalOutflow,
    };
  }, [filteredTransactions]);

  const exportToCSV = () => {
    const headers = ['Date', 'User', 'Email', 'Type', 'Amount', 'Balance After', 'Description'];
    const rows = filteredTransactions.map((tx) => [
      format(new Date(tx.created_at), 'yyyy-MM-dd HH:mm:ss'),
      tx.profiles?.username || 'Unknown',
      tx.profiles?.email || '',
      tx.type,
      tx.amount,
      tx.balance_after,
      tx.description,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const getTypeBadgeVariant = (type: string) => {
    if (['deposit', 'bonus', 'win', 'fantasy_payout', 'refund'].includes(type)) {
      return 'default';
    }
    if (['burn', 'reward_redemption', 'fantasy_entry'].includes(type)) {
      return 'secondary';
    }
    return 'outline';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-foreground">All Transactions</h1>

        <Tabs defaultValue="transactions" className="space-y-6">
          <TabsList>
            <TabsTrigger value="transactions">Token Transactions</TabsTrigger>
            <TabsTrigger value="purchases">Purchases</TabsTrigger>
          </TabsList>

          <TabsContent value="purchases">
            <PurchasesTable />
          </TabsContent>

          <TabsContent value="transactions" className="space-y-6">
            <div className="flex justify-end">
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
                <Activity className="w-4 h-4" />
                Total Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{stats.total.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-primary" />
                Total Inflow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-primary">+{stats.inflow.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ArrowDownRight className="w-4 h-4 text-destructive" />
                Total Outflow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">-{stats.outflow.toLocaleString()}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Net Flow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={cn('text-2xl font-bold', stats.net >= 0 ? 'text-primary' : 'text-destructive')}>
                {stats.net >= 0 ? '+' : ''}{stats.net.toLocaleString()}
              </p>
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
                  {(searchQuery || typeFilter !== 'all' || startDate || endDate) && (
                    <Badge variant="secondary" className="ml-2">Active</Badge>
                  )}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search user or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>

                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Transaction type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSACTION_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type === 'all' ? 'All Types' : type.replace(/_/g, ' ')}
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
              <div className="p-8 text-center text-muted-foreground">Loading transactions...</div>
            ) : filteredTransactions.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No transactions found</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance After</TableHead>
                      <TableHead>Description</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.slice(0, 100).map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(tx.created_at), 'MMM d, yyyy HH:mm')}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{tx.profiles?.username || 'Unknown'}</span>
                            <span className="text-xs text-muted-foreground">{tx.profiles?.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getTypeBadgeVariant(tx.type)}>
                            {tx.type.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn('text-right font-mono', tx.amount >= 0 ? 'text-primary' : 'text-destructive')}>
                          {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {tx.balance_after.toLocaleString()}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {tx.description}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredTransactions.length > 100 && (
                  <div className="p-4 text-center text-sm text-muted-foreground border-t">
                    Showing 100 of {filteredTransactions.length} transactions
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </TabsContent>
      </Tabs>
    </div>
  </AdminLayout>
  );
}

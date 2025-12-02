import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Coins, TrendingUp, TrendingDown, DollarSign, Gift, RefreshCw, Settings, Filter, CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
  metadata?: any;
  created_at: string;
}

const Transactions = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter states
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchTransactions();
  }, [user, navigate]);

  useEffect(() => {
    applyFilters();
  }, [transactions, typeFilter, startDate, endDate, minAmount, maxAmount]);

  const fetchTransactions = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('token_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Error fetching transactions:', error);
    } else if (data) {
      setTransactions(data);
      setFilteredTransactions(data);
    }
    
    setLoading(false);
  };

  const applyFilters = () => {
    let filtered = [...transactions];

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(t => t.type === typeFilter);
    }

    // Date range filter
    if (startDate) {
      filtered = filtered.filter(t => new Date(t.created_at) >= startDate);
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter(t => new Date(t.created_at) <= endOfDay);
    }

    // Amount range filter
    if (minAmount !== '') {
      const min = parseInt(minAmount);
      if (!isNaN(min)) {
        filtered = filtered.filter(t => Math.abs(t.amount) >= min);
      }
    }
    if (maxAmount !== '') {
      const max = parseInt(maxAmount);
      if (!isNaN(max)) {
        filtered = filtered.filter(t => Math.abs(t.amount) <= max);
      }
    }

    setFilteredTransactions(filtered);
  };

  const clearFilters = () => {
    setTypeFilter('all');
    setStartDate(undefined);
    setEndDate(undefined);
    setMinAmount('');
    setMaxAmount('');
  };

  const hasActiveFilters = typeFilter !== 'all' || startDate || endDate || minAmount !== '' || maxAmount !== '';

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bet_placed':
        return <Coins className="w-5 h-5" />;
      case 'bet_won':
        return <TrendingUp className="w-5 h-5" />;
      case 'bet_lost':
        return <TrendingDown className="w-5 h-5" />;
      case 'bet_void':
        return <RefreshCw className="w-5 h-5" />;
      case 'deposit':
        return <DollarSign className="w-5 h-5" />;
      case 'bonus':
        return <Gift className="w-5 h-5" />;
      case 'adjustment':
        return <Settings className="w-5 h-5" />;
      default:
        return <Coins className="w-5 h-5" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const variants: Record<string, any> = {
      bet_placed: 'secondary',
      bet_won: 'default',
      bet_lost: 'destructive',
      bet_void: 'outline',
      deposit: 'default',
      bonus: 'default',
      adjustment: 'secondary',
    };

    const labels: Record<string, string> = {
      bet_placed: 'Bet Placed',
      bet_won: 'Won',
      bet_lost: 'Lost',
      bet_void: 'Voided',
      deposit: 'Deposit',
      bonus: 'Bonus',
      adjustment: 'Adjustment',
    };

    return (
      <Badge variant={variants[type] || 'secondary'} className="text-xs">
        {labels[type] || type}
      </Badge>
    );
  };

  const formatAmount = (amount: number) => {
    const sign = amount >= 0 ? '+' : '';
    return `${sign}${amount.toLocaleString()}`;
  };

  const getAmountColor = (amount: number) => {
    if (amount > 0) return 'text-success';
    if (amount < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Transaction History" showBack />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Filter Toggle & Summary */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="w-4 h-4" />
            Filters
            {hasActiveFilters && (
              <Badge variant="default" className="ml-1 px-1.5 py-0.5 text-xs">
                {filteredTransactions.length}
              </Badge>
            )}
          </Button>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="gap-1 text-muted-foreground"
            >
              <X className="w-4 h-4" />
              Clear
            </Button>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <Card className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="type-filter">Transaction Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger id="type-filter">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="bet_placed">Bet Placed</SelectItem>
                  <SelectItem value="bet_won">Bet Won</SelectItem>
                  <SelectItem value="bet_lost">Bet Lost</SelectItem>
                  <SelectItem value="bet_void">Bet Voided</SelectItem>
                  <SelectItem value="deposit">Deposit</SelectItem>
                  <SelectItem value="bonus">Bonus</SelectItem>
                  <SelectItem value="redemption">Redemption</SelectItem>
                  <SelectItem value="adjustment">Admin Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>From Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !startDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {startDate ? format(startDate, "MMM d, yyyy") : "Start"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>To Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !endDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {endDate ? format(endDate, "MMM d, yyyy") : "End"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min-amount">Min Amount</Label>
                <Input
                  id="min-amount"
                  type="number"
                  placeholder="0"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-amount">Max Amount</Label>
                <Input
                  id="max-amount"
                  type="number"
                  placeholder="Any"
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                />
              </div>
            </div>

            <div className="pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {filteredTransactions.length} of {transactions.length} transactions
              </p>
            </div>
          </Card>
        )}

        {/* Transactions List */}
        {loading ? (
          <div className="text-center text-muted-foreground py-12">
            Loading transactions...
          </div>
        ) : transactions.length === 0 ? (
          <Card className="p-12 text-center">
            <Coins className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No transactions yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Your transaction history will appear here
            </p>
          </Card>
        ) : filteredTransactions.length === 0 ? (
          <Card className="p-12 text-center">
            <Filter className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No transactions match your filters</p>
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="mt-4"
            >
              Clear Filters
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map((transaction) => (
              <Card key={transaction.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-1 text-muted-foreground">
                      {getTypeIcon(transaction.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {getTypeBadge(transaction.type)}
                      </div>
                      <p className="text-sm font-medium text-foreground mb-1">
                        {transaction.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          Balance: {transaction.balance_after.toLocaleString()} tokens
                        </span>
                        <span>•</span>
                        <span>
                          {format(new Date(transaction.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`text-right font-bold text-lg ${getAmountColor(transaction.amount)}`}>
                    {formatAmount(transaction.amount)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
};

export default Transactions;

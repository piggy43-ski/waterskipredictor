import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Coins, TrendingUp, TrendingDown, DollarSign, Gift, RefreshCw, Settings } from 'lucide-react';
import { format } from 'date-fns';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchTransactions();
  }, [user, navigate]);

  const fetchTransactions = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('token_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching transactions:', error);
    } else if (data) {
      setTransactions(data);
    }
    
    setLoading(false);
  };

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
      
      <div className="max-w-lg mx-auto px-4 py-6">
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
        ) : (
          <div className="space-y-3">
            {transactions.map((transaction) => (
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

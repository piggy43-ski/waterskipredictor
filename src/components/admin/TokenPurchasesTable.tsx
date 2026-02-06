import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { DollarSign, Coins, Users, Copy, Check, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { formatTokensWithUSD } from '@/utils/tokenConversion';

interface DepositRecord {
  id: string;
  user_id: string;
  amount_usd: number;
  tokens_amount: number;
  transaction_type: string;
  stripe_payment_intent_id: string | null;
  description: string | null;
  created_at: string;
  user?: {
    username: string | null;
    email: string | null;
  };
}

export const TokenPurchasesTable = () => {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch deposit ledger with user info
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['admin-token-purchases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_ledger')
        .select(`
          id,
          user_id,
          amount_usd,
          tokens_amount,
          transaction_type,
          stripe_payment_intent_id,
          description,
          created_at,
          user:profiles!deposit_ledger_user_id_fkey(username, email)
        `)
        .eq('transaction_type', 'deposit')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as DepositRecord[];
    }
  });

  // Calculate summary stats
  const totalRevenue = purchases.reduce((sum, p) => sum + Number(p.amount_usd || 0), 0);
  const totalTokensSold = purchases.reduce((sum, p) => sum + (p.tokens_amount || 0), 0);
  const uniqueBuyers = new Set(purchases.map(p => p.user_id)).size;

  // Extract pack name from description (e.g., "Pro Pack Purchase" -> "Pro")
  const getPackName = (description: string | null): string => {
    if (!description) return 'Unknown';
    const match = description.match(/^(\w+)\s+Pack/i);
    return match ? match[1] : 'Unknown';
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon 
  }: { 
    title: string; 
    value: string | number; 
    icon: React.ElementType;
  }) => (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </div>
    </Card>
  );

  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-6 w-48 mb-4" />
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64" />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
        <CreditCard className="w-5 h-5" />
        Token Purchases
      </h2>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          title="Total Revenue"
          value={`$${totalRevenue.toFixed(2)}`}
          icon={DollarSign}
        />
        <StatCard
          title="Tokens Sold"
          value={totalTokensSold.toLocaleString()}
          icon={Coins}
        />
        <StatCard
          title="Unique Buyers"
          value={uniqueBuyers}
          icon={Users}
        />
      </div>

      {/* Purchases Table */}
      {purchases.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Pack</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount (USD)</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead>Stripe ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map((purchase) => (
              <TableRow key={purchase.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">
                      {purchase.user?.username || 'Unknown'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {purchase.user?.email || purchase.user_id.slice(0, 8)}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {getPackName(purchase.description)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {format(new Date(purchase.created_at), 'MMM d, yyyy')}
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(purchase.created_at), 'h:mm a')}
                  </p>
                </TableCell>
                <TableCell className="text-right font-medium">
                  ${Number(purchase.amount_usd).toFixed(2)}
                </TableCell>
                <TableCell className="text-right">
                  <span className="font-bold text-primary">
                    {purchase.tokens_amount.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell>
                  {purchase.stripe_payment_intent_id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs font-mono"
                      onClick={() => copyToClipboard(purchase.stripe_payment_intent_id!)}
                    >
                      {purchase.stripe_payment_intent_id.slice(0, 12)}...
                      {copiedId === purchase.stripe_payment_intent_id ? (
                        <Check className="w-3 h-3 ml-1 text-success" />
                      ) : (
                        <Copy className="w-3 h-3 ml-1" />
                      )}
                    </Button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-muted-foreground text-center py-8">
          No token purchases yet
        </p>
      )}
    </Card>
  );
};

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, DollarSign, Coins, Gift, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface PurchaseWithDetails {
  id: string;
  user_id: string | null;
  amount_usd: number;
  tokens_amount: number | null;
  created_at: string;
  stripe_payment_intent_id: string | null;
  description: string | null;
  // Joined data
  profile: {
    username: string | null;
    email: string | null;
  } | null;
  referral: {
    code: string;
    bonus_tokens_awarded: number;
    pack_name: string | null;
    commission_rate_used: number | null;
    referrer_reward_tokens: number | null;
    referrer_user_id: string | null;
    referrer_username: string | null;
  } | null;
}

// Pack definitions based on USD amounts
const getPackName = (usd: number): string => {
  if (usd === 25) return 'Starter';
  if (usd === 50) return 'Standard';
  if (usd === 100) return 'Pro';
  if (usd === 250) return 'Elite';
  return `$${usd}`;
};

export function PurchasesTable() {
  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ['admin-purchases-detailed'],
    queryFn: async () => {
      // Fetch deposits
      const { data: deposits, error: depositError } = await supabase
        .from('deposit_ledger')
        .select('*')
        .eq('transaction_type', 'deposit')
        .order('created_at', { ascending: false })
        .limit(500);

      if (depositError) throw depositError;
      if (!deposits || deposits.length === 0) return [];

      // Get user IDs for profile lookup
      const userIds = [...new Set(deposits.map(d => d.user_id).filter(Boolean))] as string[];

      // Fetch profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, email')
        .in('id', userIds);

      const profilesMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Get payment intent IDs for referral lookup
      const paymentIntentIds = deposits
        .map(d => d.stripe_payment_intent_id)
        .filter(Boolean) as string[];

      // Fetch referral redemptions
      const { data: redemptions } = await supabase
        .from('referral_redemptions')
        .select('purchase_id, bonus_tokens_awarded, pack_name, commission_rate_used, referrer_reward_value, referral_code_id, referrer_user_id')
        .in('purchase_id', paymentIntentIds);

      // Get referral code IDs for code lookup
      const codeIds = redemptions?.map(r => r.referral_code_id).filter(Boolean) || [];
      
      const { data: codes } = await supabase
        .from('referral_codes')
        .select('id, code, owner_user_id')
        .in('id', codeIds);

      const codesMap = new Map(codes?.map(c => [c.id, c]) || []);

      // Get referrer profiles
      const referrerIds = redemptions?.map(r => r.referrer_user_id).filter(Boolean) as string[] || [];

      const { data: referrerProfiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', referrerIds);

      const referrerMap = new Map(referrerProfiles?.map(p => [p.id, p.username]) || []);

      // Create redemption lookup by purchase_id
      const redemptionMap = new Map(
        redemptions?.map(r => {
          const codeInfo = codesMap.get(r.referral_code_id);
          return [
            r.purchase_id,
            {
              code: codeInfo?.code || '',
              bonus_tokens_awarded: r.bonus_tokens_awarded,
              pack_name: r.pack_name,
              commission_rate_used: r.commission_rate_used,
              referrer_reward_tokens: r.referrer_reward_value,
              referrer_user_id: r.referrer_user_id,
              referrer_username: r.referrer_user_id ? referrerMap.get(r.referrer_user_id) || null : null,
            },
          ];
        }) || []
      );

      // Merge all data
      return deposits.map(d => ({
        id: d.id,
        user_id: d.user_id,
        amount_usd: d.amount_usd,
        tokens_amount: d.tokens_amount,
        created_at: d.created_at,
        stripe_payment_intent_id: d.stripe_payment_intent_id,
        description: d.description,
        profile: d.user_id ? profilesMap.get(d.user_id) || null : null,
        referral: d.stripe_payment_intent_id
          ? redemptionMap.get(d.stripe_payment_intent_id) || null
          : null,
      })) as PurchaseWithDetails[];
    },
  });

  const stats = useMemo(() => {
    const totalRevenue = purchases.reduce((sum, p) => sum + p.amount_usd, 0);
    const totalTokensSold = purchases.reduce((sum, p) => sum + (p.tokens_amount || 0), 0);
    const totalBonusTokens = purchases.reduce(
      (sum, p) => sum + (p.referral?.bonus_tokens_awarded || 0),
      0
    );
    const referralsUsed = purchases.filter(p => p.referral).length;

    return { totalRevenue, totalTokensSold, totalBonusTokens, referralsUsed };
  }, [purchases]);

  const exportToCSV = () => {
    const headers = [
      'Date',
      'User',
      'Email',
      'Pack',
      'USD',
      'Base Tokens',
      'Bonus Tokens',
      'Total Tokens',
      'Referral Code',
      'Referrer',
      'Commission %',
    ];
    const rows = purchases.map(p => {
      const baseTokens = (p.tokens_amount || 0) - (p.referral?.bonus_tokens_awarded || 0);
      return [
        format(new Date(p.created_at), 'yyyy-MM-dd HH:mm:ss'),
        p.profile?.username || 'Unknown',
        p.profile?.email || '',
        p.referral?.pack_name || getPackName(p.amount_usd),
        p.amount_usd.toFixed(2),
        baseTokens,
        p.referral?.bonus_tokens_awarded || 0,
        p.tokens_amount || 0,
        p.referral?.code || '',
        p.referral?.referrer_username || '',
        p.referral?.commission_rate_used ? `${(p.referral.commission_rate_used * 100).toFixed(0)}%` : '',
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `purchases-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">${stats.totalRevenue.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Coins className="w-4 h-4" />
              Tokens Sold
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.totalTokensSold.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Gift className="w-4 h-4 text-primary" />
              Bonus Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">+{stats.totalBonusTokens.toLocaleString()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="w-4 h-4" />
              Referrals Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.referralsUsed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Export Button */}
      <div className="flex justify-end">
        <Button onClick={exportToCSV} variant="outline" size="sm">
          <Download className="w-4 h-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading purchases...</div>
          ) : purchases.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No purchases found</div>
          ) : (
            <TooltipProvider>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Pack</TableHead>
                      <TableHead className="text-right">USD</TableHead>
                      <TableHead className="text-right">Base Tokens</TableHead>
                      <TableHead className="text-right">Bonus</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Referral</TableHead>
                      <TableHead>Referrer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchases.map(p => {
                      const baseTokens = (p.tokens_amount || 0) - (p.referral?.bonus_tokens_awarded || 0);
                      const packName = p.referral?.pack_name || getPackName(p.amount_usd);

                      return (
                        <TableRow key={p.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(p.created_at), 'MMM d, yyyy HH:mm')}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {p.profile?.username || 'Unknown'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {p.profile?.email}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{packName}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${p.amount_usd.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {baseTokens.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {p.referral?.bonus_tokens_awarded ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-primary cursor-help">
                                    +{p.referral.bonus_tokens_awarded.toLocaleString()}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Via {p.referral.code}</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-semibold">
                            {(p.tokens_amount || 0).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {p.referral?.code ? (
                              <Badge variant="secondary">{p.referral.code}</Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {p.referral?.referrer_username ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-help">
                                    {p.referral.referrer_username}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    Commission:{' '}
                                    {p.referral.commission_rate_used
                                      ? `${(p.referral.commission_rate_used * 100).toFixed(0)}%`
                                      : 'N/A'}
                                  </p>
                                  {p.referral.referrer_reward_tokens && (
                                    <p>Reward: {p.referral.referrer_reward_tokens.toLocaleString()} tokens</p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            ) : p.referral?.code ? (
                              <span className="text-muted-foreground text-xs">No owner</span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

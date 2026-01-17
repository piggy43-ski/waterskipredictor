import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { Coins, DollarSign, Package, AlertTriangle, ShieldAlert, TrendingUp, Clock, CheckCircle, Truck } from 'lucide-react';
import { TOKENS_PER_USD, tokensToUSD, formatUSD } from '@/utils/tokenConversion';

type RewardWithInventory = {
  id: string;
  name: string;
  available: boolean;
  max_total: number | null;
  usd_cost: number | null;
  required_tokens: number;
  redeemed_count: number;
};

type StatusBreakdown = {
  status: string;
  count: number;
  total_usd: number;
};

export default function RewardLiabilityDashboard() {
  // Fetch total outstanding tokens across all wallets
  const { data: tokenStats } = useQuery({
    queryKey: ['liability-token-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('token_wallets')
        .select('earned_tokens, purchased_tokens');
      
      if (error) throw error;
      
      const totalTokens = data?.reduce(
        (sum, wallet) => sum + (wallet.earned_tokens || 0) + (wallet.purchased_tokens || 0),
        0
      ) || 0;
      
      return {
        totalOutstandingTokens: totalTokens,
        usdEquivalent: tokensToUSD(totalTokens),
      };
    },
  });

  // Fetch pending redemptions by status
  const { data: redemptionStats } = useQuery({
    queryKey: ['liability-redemption-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('house_rewards_liability')
        .select('status, usd_estimated_cost');
      
      if (error) throw error;
      
      const statusMap: Record<string, StatusBreakdown> = {};
      let totalPendingUsd = 0;
      let totalPendingCount = 0;
      
      data?.forEach(item => {
        if (!statusMap[item.status]) {
          statusMap[item.status] = { status: item.status, count: 0, total_usd: 0 };
        }
        statusMap[item.status].count++;
        statusMap[item.status].total_usd += item.usd_estimated_cost || 0;
        
        // Count as pending if not delivered, closed, or cancelled
        if (!['delivered', 'closed', 'cancelled'].includes(item.status)) {
          totalPendingUsd += item.usd_estimated_cost || 0;
          totalPendingCount++;
        }
      });
      
      return {
        byStatus: Object.values(statusMap),
        totalPendingUsd,
        totalPendingCount,
      };
    },
  });

  // Fetch active rewards with inventory tracking
  const { data: inventoryStats } = useQuery({
    queryKey: ['liability-inventory-stats'],
    queryFn: async () => {
      // Get all active rewards
      const { data: rewards, error: rewardsError } = await supabase
        .from('rewards')
        .select('id, name, available, max_total, usd_cost, required_tokens')
        .eq('available', true);
      
      if (rewardsError) throw rewardsError;
      
      // Get redemption counts per reward
      const { data: redemptions, error: redemptionsError } = await supabase
        .from('redemptions')
        .select('reward_id');
      
      if (redemptionsError) throw redemptionsError;
      
      const redemptionCounts: Record<string, number> = {};
      redemptions?.forEach(r => {
        redemptionCounts[r.reward_id] = (redemptionCounts[r.reward_id] || 0) + 1;
      });
      
      const rewardsWithInventory: RewardWithInventory[] = rewards?.map(r => ({
        ...r,
        redeemed_count: redemptionCounts[r.id] || 0,
      })) || [];
      
      // Calculate inventory value (only for rewards with max_total set)
      const inventoryTracked = rewardsWithInventory.filter(r => r.max_total !== null);
      const inventoryValue = inventoryTracked.reduce((sum, r) => {
        const remaining = (r.max_total || 0) - r.redeemed_count;
        return sum + (remaining * (r.usd_cost || 0));
      }, 0);
      
      return {
        activeRewardsCount: rewards?.length || 0,
        inventoryTrackedCount: inventoryTracked.length,
        inventoryValue,
        rewardsWithInventory: inventoryTracked,
        hasInventoryTracking: inventoryTracked.length > 0,
      };
    },
  });

  // Calculate liability ratio
  const liabilityRatio = tokenStats && redemptionStats && tokenStats.usdEquivalent > 0
    ? redemptionStats.totalPendingUsd / tokenStats.usdEquivalent
    : 0;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'unfulfilled': return <Clock className="h-4 w-4" />;
      case 'ordered': return <Package className="h-4 w-4" />;
      case 'shipped': return <Truck className="h-4 w-4" />;
      case 'delivered': return <CheckCircle className="h-4 w-4" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'unfulfilled': return 'bg-yellow-500';
      case 'ordered': return 'bg-blue-500';
      case 'shipped': return 'bg-purple-500';
      case 'delivered': return 'bg-green-500';
      case 'closed': return 'bg-muted';
      case 'cancelled': return 'bg-destructive';
      default: return 'bg-muted';
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Reward Liability Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Track outstanding token liability and estimated fulfillment costs
          </p>
        </div>

        {/* Warning Banners */}
        {liabilityRatio > 0.85 && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Critical: High Liability Ratio</AlertTitle>
            <AlertDescription>
              Pending redemption cost ({formatUSD(redemptionStats?.totalPendingUsd || 0)}) is at{' '}
              {(liabilityRatio * 100).toFixed(1)}% of total outstanding token value. 
              Consider pausing new redemptions or increasing inventory.
            </AlertDescription>
          </Alert>
        )}
        
        {liabilityRatio > 0.7 && liabilityRatio <= 0.85 && (
          <Alert className="border-yellow-500 bg-yellow-500/10">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            <AlertTitle className="text-yellow-600">Warning: Liability Approaching Threshold</AlertTitle>
            <AlertDescription className="text-yellow-600">
              Pending redemption cost is at {(liabilityRatio * 100).toFixed(1)}% of total outstanding token value.
              Monitor closely.
            </AlertDescription>
          </Alert>
        )}

        {/* Summary Cards - Top Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Outstanding Tokens</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(tokenStats?.totalOutstandingTokens || 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                Redeemable tokens across all users
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">USD Equivalent Exposure</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatUSD(tokenStats?.usdEquivalent || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                At {TOKENS_PER_USD} tokens = $1.00
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Redemptions</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {redemptionStats?.totalPendingCount || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Awaiting fulfillment
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Summary Cards - Bottom Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending USD Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">
                {formatUSD(redemptionStats?.totalPendingUsd || 0)}
              </div>
              <p className="text-xs text-muted-foreground">
                Estimated fulfillment cost
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Rewards</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {inventoryStats?.activeRewardsCount || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {inventoryStats?.inventoryTrackedCount || 0} with inventory tracking
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {inventoryStats?.hasInventoryTracking 
                  ? formatUSD(inventoryStats?.inventoryValue || 0)
                  : 'N/A'}
              </div>
              <p className="text-xs text-muted-foreground">
                {inventoryStats?.hasInventoryTracking 
                  ? 'Remaining stock value'
                  : 'Inventory tracking not enabled'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Liability Ratio Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Liability Ratio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-4 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${
                      liabilityRatio > 0.85 
                        ? 'bg-destructive' 
                        : liabilityRatio > 0.7 
                          ? 'bg-yellow-500' 
                          : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(liabilityRatio * 100, 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-2xl font-bold">
                {(liabilityRatio * 100).toFixed(1)}%
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Pending redemption cost / Total outstanding token value
            </p>
          </CardContent>
        </Card>

        {/* Redemptions by Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Redemptions by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {redemptionStats?.byStatus && redemptionStats.byStatus.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Est. USD Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {redemptionStats.byStatus.map((item) => (
                    <TableRow key={item.status}>
                      <TableCell>
                        <Badge className={`${getStatusColor(item.status)} text-white`}>
                          <span className="flex items-center gap-1">
                            {getStatusIcon(item.status)}
                            <span className="capitalize">{item.status}</span>
                          </span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">{item.count}</TableCell>
                      <TableCell className="text-right">{formatUSD(item.total_usd)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-center py-4">No redemptions found</p>
            )}
          </CardContent>
        </Card>

        {/* Inventory Summary */}
        {inventoryStats?.hasInventoryTracking && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Catalog Summary (Inventory Tracked)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reward</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">Redeemed</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Remaining Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryStats.rewardsWithInventory.map((reward) => {
                    const remaining = (reward.max_total || 0) - reward.redeemed_count;
                    const remainingValue = remaining * (reward.usd_cost || 0);
                    
                    return (
                      <TableRow key={reward.id}>
                        <TableCell className="font-medium">{reward.name}</TableCell>
                        <TableCell className="text-right">{reward.max_total}</TableCell>
                        <TableCell className="text-right">{reward.redeemed_count}</TableCell>
                        <TableCell className="text-right">
                          {reward.usd_cost ? formatUSD(reward.usd_cost) : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatUSD(remainingValue)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

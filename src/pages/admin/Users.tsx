import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Search, Plus, Flame, Users, Coins, Eye } from 'lucide-react';
import { formatTokensWithUSD, tokensToUSD, formatTokens } from '@/utils/tokenConversion';
import { UserAnalyticsDrilldown } from '@/components/admin/UserAnalyticsDrilldown';

interface UserWithWallet {
  id: string;
  email: string;
  username: string;
  earned_tokens: number;
  purchased_tokens: number;
  totalWagered?: number;
  netPL?: number;
}

const AdminUsers = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserWithWallet | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [burnDialogOpen, setBurnDialogOpen] = useState(false);
  const [tokenAmount, setTokenAmount] = useState('');
  const [tokenType, setTokenType] = useState<'bonus' | 'adjustment'>('bonus');
  const [reason, setReason] = useState('');
  const [drilldownUser, setDrilldownUser] = useState<{ id: string; username: string } | null>(null);
  const queryClient = useQueryClient();

  // Fetch users with their wallets
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, username');
      
      if (profilesError) throw profilesError;

      const { data: wallets, error: walletsError } = await supabase
        .from('token_wallets')
        .select('user_id, earned_tokens, purchased_tokens');
      
      if (walletsError) throw walletsError;

      const walletMap = new Map(wallets?.map(w => [w.user_id, w]));
      
      return profiles?.map(p => ({
        id: p.id,
        email: p.email,
        username: p.username,
        earned_tokens: walletMap.get(p.id)?.earned_tokens || 0,
        purchased_tokens: walletMap.get(p.id)?.purchased_tokens || 0,
      })) as UserWithWallet[];
    },
  });

  // Add tokens mutation
  const addTokensMutation = useMutation({
    mutationFn: async ({ userId, amount, type, description }: { userId: string; amount: number; type: string; description: string }) => {
      // Get current balance
      const { data: wallet, error: walletError } = await supabase
        .from('token_wallets')
        .select('earned_tokens, purchased_tokens')
        .eq('user_id', userId)
        .single();
      
      if (walletError) throw walletError;

      const currentBalance = (wallet?.earned_tokens || 0) + (wallet?.purchased_tokens || 0);
      const newBalance = currentBalance + amount;

      // Update wallet
      const { error: updateError } = await supabase
        .from('token_wallets')
        .update({ earned_tokens: (wallet?.earned_tokens || 0) + amount })
        .eq('user_id', userId);
      
      if (updateError) throw updateError;

      // Create transaction record
      const { error: transactionError } = await supabase
        .from('token_transactions')
        .insert({
          user_id: userId,
          type,
          amount,
          balance_after: newBalance,
          description,
        });
      
      if (transactionError) throw transactionError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Tokens added successfully');
      resetDialogs();
    },
    onError: (error) => {
      toast.error(`Failed to add tokens: ${error.message}`);
    },
  });

  // Burn tokens mutation
  const burnTokensMutation = useMutation({
    mutationFn: async ({ userId, amount, description }: { userId: string; amount: number; description: string }) => {
      // Get current balance
      const { data: wallet, error: walletError } = await supabase
        .from('token_wallets')
        .select('earned_tokens, purchased_tokens')
        .eq('user_id', userId)
        .single();
      
      if (walletError) throw walletError;

      const currentEarned = wallet?.earned_tokens || 0;
      const currentPurchased = wallet?.purchased_tokens || 0;
      const currentBalance = currentEarned + currentPurchased;

      if (amount > currentBalance) {
        throw new Error('Insufficient balance to burn');
      }

      const newBalance = currentBalance - amount;

      // Burn from earned tokens first, then purchased
      let newEarned = currentEarned;
      let newPurchased = currentPurchased;
      
      if (amount <= currentEarned) {
        newEarned = currentEarned - amount;
      } else {
        newEarned = 0;
        newPurchased = currentPurchased - (amount - currentEarned);
      }

      // Update wallet
      const { error: updateError } = await supabase
        .from('token_wallets')
        .update({ 
          earned_tokens: newEarned,
          purchased_tokens: newPurchased 
        })
        .eq('user_id', userId);
      
      if (updateError) throw updateError;

      // Create transaction record (negative amount for burn)
      const { error: transactionError } = await supabase
        .from('token_transactions')
        .insert({
          user_id: userId,
          type: 'burn',
          amount: -amount,
          balance_after: newBalance,
          description,
        });
      
      if (transactionError) throw transactionError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success('Tokens burned successfully');
      resetDialogs();
    },
    onError: (error) => {
      toast.error(`Failed to burn tokens: ${error.message}`);
    },
  });

  const resetDialogs = () => {
    setAddDialogOpen(false);
    setBurnDialogOpen(false);
    setSelectedUser(null);
    setTokenAmount('');
    setTokenType('bonus');
    setReason('');
  };

  const handleAddTokens = () => {
    if (!selectedUser || !tokenAmount || !reason) {
      toast.error('Please fill all fields');
      return;
    }
    const amount = parseInt(tokenAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    addTokensMutation.mutate({
      userId: selectedUser.id,
      amount,
      type: tokenType,
      description: reason,
    });
  };

  const handleBurnTokens = () => {
    if (!selectedUser || !tokenAmount || !reason) {
      toast.error('Please fill all fields');
      return;
    }
    const amount = parseInt(tokenAmount);
    if (isNaN(amount) || amount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    const balance = selectedUser.earned_tokens + selectedUser.purchased_tokens;
    if (amount > balance) {
      toast.error('Cannot burn more than current balance');
      return;
    }
    burnTokensMutation.mutate({
      userId: selectedUser.id,
      amount,
      description: reason,
    });
  };

  const filteredUsers = users?.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.username.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const totalTokens = users?.reduce((sum, u) => sum + u.earned_tokens + u.purchased_tokens, 0) || 0;

  // If viewing a specific user's drilldown
  if (drilldownUser) {
    return (
      <AdminLayout>
        <UserAnalyticsDrilldown
          userId={drilldownUser.id}
          username={drilldownUser.username}
          onBack={() => setDrilldownUser(null)}
        />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage user tokens, view balances, and betting analytics</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Players</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Tokens in Circulation</CardTitle>
              <Coins className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatTokensWithUSD(totalTokens)}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users by email or username..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Earned Tokens</TableHead>
                  <TableHead className="text-right">Purchased Tokens</TableHead>
                  <TableHead className="text-right">Total Balance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const totalBalance = user.earned_tokens + user.purchased_tokens;
                    return (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell className="text-right">{formatTokensWithUSD(user.earned_tokens)}</TableCell>
                        <TableCell className="text-right">{formatTokensWithUSD(user.purchased_tokens)}</TableCell>
                        <TableCell className="text-right font-medium">{formatTokensWithUSD(totalBalance)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setDrilldownUser({ id: user.id, username: user.username })}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                            <Dialog open={addDialogOpen && selectedUser?.id === user.id} onOpenChange={(open) => {
                              if (open) {
                                setSelectedUser(user);
                                setAddDialogOpen(true);
                              } else {
                                resetDialogs();
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Plus className="h-4 w-4 mr-1" />
                                  Add
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Add Tokens to {user.username}</DialogTitle>
                                  <DialogDescription>
                                    Current balance: {formatTokensWithUSD(totalBalance)}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label>Amount</Label>
                                    <Input
                                      type="number"
                                      placeholder="Enter token amount"
                                      value={tokenAmount}
                                      onChange={(e) => setTokenAmount(e.target.value)}
                                    />
                                    {tokenAmount && !isNaN(parseInt(tokenAmount)) && (
                                      <p className="text-sm text-muted-foreground">
                                        = ${tokensToUSD(parseInt(tokenAmount)).toFixed(2)} USD
                                      </p>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Type</Label>
                                    <Select value={tokenType} onValueChange={(v) => setTokenType(v as 'bonus' | 'adjustment')}>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="bonus">Bonus</SelectItem>
                                        <SelectItem value="adjustment">Adjustment</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Reason</Label>
                                    <Textarea
                                      placeholder="Enter reason for adding tokens..."
                                      value={reason}
                                      onChange={(e) => setReason(e.target.value)}
                                    />
                                  </div>
                                  {tokenAmount && !isNaN(parseInt(tokenAmount)) && (
                                    <div className="p-3 bg-muted rounded-lg">
                                      <p className="text-sm">
                                        New balance: <span className="font-bold text-green-600">
                                          {formatTokensWithUSD(totalBalance + parseInt(tokenAmount))}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={resetDialogs}>Cancel</Button>
                                  <Button onClick={handleAddTokens} disabled={addTokensMutation.isPending}>
                                    {addTokensMutation.isPending ? 'Adding...' : 'Add Tokens'}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>

                            <Dialog open={burnDialogOpen && selectedUser?.id === user.id} onOpenChange={(open) => {
                              if (open) {
                                setSelectedUser(user);
                                setBurnDialogOpen(true);
                              } else {
                                resetDialogs();
                              }
                            }}>
                              <DialogTrigger asChild>
                                <Button variant="destructive" size="sm">
                                  <Flame className="h-4 w-4 mr-1" />
                                  Burn
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Burn Tokens from {user.username}</DialogTitle>
                                  <DialogDescription>
                                    Current balance: {formatTokensWithUSD(totalBalance)}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                                    <p className="text-sm text-destructive font-medium">
                                      ⚠️ Warning: Burned tokens are permanently removed from circulation.
                                    </p>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Amount to Burn</Label>
                                    <Input
                                      type="number"
                                      placeholder="Enter token amount"
                                      value={tokenAmount}
                                      onChange={(e) => setTokenAmount(e.target.value)}
                                      max={totalBalance}
                                    />
                                    {tokenAmount && !isNaN(parseInt(tokenAmount)) && (
                                      <p className="text-sm text-muted-foreground">
                                        = ${tokensToUSD(parseInt(tokenAmount)).toFixed(2)} USD
                                      </p>
                                    )}
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Reason</Label>
                                    <Textarea
                                      placeholder="Enter reason for burning tokens..."
                                      value={reason}
                                      onChange={(e) => setReason(e.target.value)}
                                    />
                                  </div>
                                  {tokenAmount && !isNaN(parseInt(tokenAmount)) && (
                                    <div className="p-3 bg-muted rounded-lg">
                                      <p className="text-sm">
                                        New balance: <span className={`font-bold ${parseInt(tokenAmount) > totalBalance ? 'text-destructive' : 'text-orange-600'}`}>
                                          {formatTokensWithUSD(Math.max(0, totalBalance - parseInt(tokenAmount)))}
                                        </span>
                                      </p>
                                    </div>
                                  )}
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" onClick={resetDialogs}>Cancel</Button>
                                  <Button 
                                    variant="destructive" 
                                    onClick={handleBurnTokens} 
                                    disabled={burnTokensMutation.isPending || (tokenAmount && parseInt(tokenAmount) > totalBalance)}
                                  >
                                    {burnTokensMutation.isPending ? 'Burning...' : 'Burn Tokens'}
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminUsers;
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Coins, Upload, History, Gift, TrendingUp, TrendingDown, ArrowRightLeft, Package, Clock, CheckCircle, Truck, XCircle, HelpCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useWallet } from '@/hooks/useWallet';
import { Skeleton } from '@/components/ui/skeleton';
import { useTutorial } from '@/components/tutorial';

type Redemption = {
  id: string;
  reward_id: string;
  tokens_spent: number;
  status: string;
  created_at: string;
  reward_name?: string;
  reward_image_url?: string | null;
  fulfillment_status?: string;
};

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const { wallet, loading: walletLoading } = useWallet();
  const { resetTutorial, startTutorial } = useTutorial();
  
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [lifetimeDeposited, setLifetimeDeposited] = useState(0);
  const [lifetimeWinnings, setLifetimeWinnings] = useState(0);
  const [lifetimeLosses, setLifetimeLosses] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(true);
  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchProfile();
    fetchLifetimeStats();
    checkAdminStatus();
    fetchRecentTransactions();
    fetchRedemptions();
  }, [user, navigate]);

  const checkAdminStatus = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
    
    setIsAdmin(!!data);
  };

  const fetchProfile = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('username, country, avatar_url, lifetime_deposited')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      return;
    }

    if (data) {
      setUsername(data.username || '');
      setCountry(data.country || '');
      setAvatarUrl(data.avatar_url || '');
      setLifetimeDeposited(data.lifetime_deposited || 0);
    }
  };

  const fetchLifetimeStats = async () => {
    if (!user) return;

    // Use entries table for accurate stats (avoids double-counting parlay legs)
    const { data, error } = await supabase
      .from('bet_slips')
      .select('status, total_stake_tokens, actual_payout_tokens')
      .eq('user_id', user.id)
      .in('status', ['WON', 'LOST']);

    if (error) {
      console.error('Error fetching lifetime stats:', error);
      return;
    }

    if (!data) {
      setLifetimeWinnings(0);
      setLifetimeLosses(0);
      return;
    }

    let winnings = 0;
    let losses = 0;

    for (const slip of data) {
      const status = String(slip.status);
      if (status === 'WON') {
        const payout = slip.actual_payout_tokens ?? 0;
        const stake = slip.total_stake_tokens ?? 0;
        const profit = payout - stake;
        if (profit > 0) {
          winnings += profit;
        }
      } else if (status === 'LOST') {
        losses += slip.total_stake_tokens ?? 0;
      }
    }

    setLifetimeWinnings(winnings);
    setLifetimeLosses(losses);
  };

  const fetchRecentTransactions = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('token_transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('Error fetching transactions:', error);
      return;
    }

    if (data) {
      setRecentTransactions(data);
    }
  };

  const fetchRedemptions = async () => {
    if (!user) return;
    setRedemptionsLoading(true);

    try {
      // Fetch redemptions
      const { data: redemptionsData, error: redemptionsError } = await supabase
        .from('redemptions')
        .select('id, reward_id, tokens_spent, status, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (redemptionsError) throw redemptionsError;

      if (!redemptionsData || redemptionsData.length === 0) {
        setRedemptions([]);
        return;
      }

      // Get reward details
      const rewardIds = [...new Set(redemptionsData.map(r => r.reward_id))];
      const { data: rewardsData } = await supabase
        .from('rewards')
        .select('id, name, image_url')
        .in('id', rewardIds);

      // Get fulfillment statuses from liabilities
      const redemptionIds = redemptionsData.map(r => r.id);
      const { data: liabilitiesData } = await supabase
        .from('house_rewards_liability')
        .select('redemption_id, status')
        .in('redemption_id', redemptionIds);

      const rewardsMap = new Map(rewardsData?.map(r => [r.id, r]) || []);
      const liabilitiesMap = new Map(liabilitiesData?.map(l => [l.redemption_id, l.status]) || []);

      const mappedRedemptions: Redemption[] = redemptionsData.map(r => ({
        id: r.id,
        reward_id: r.reward_id,
        tokens_spent: r.tokens_spent,
        status: r.status,
        created_at: r.created_at,
        reward_name: rewardsMap.get(r.reward_id)?.name || 'Unknown Reward',
        reward_image_url: rewardsMap.get(r.reward_id)?.image_url,
        fulfillment_status: liabilitiesMap.get(r.id) || 'pending',
      }));

      setRedemptions(mappedRedemptions);
    } catch (error) {
      console.error('Error fetching redemptions:', error);
    } finally {
      setRedemptionsLoading(false);
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'bonus': return <Gift className="w-4 h-4" />;
      case 'win': return <TrendingUp className="w-4 h-4" />;
      case 'loss':
      case 'entry': return <TrendingDown className="w-4 h-4" />;
      default: return <ArrowRightLeft className="w-4 h-4" />;
    }
  };

  const getTransactionBadgeVariant = (type: string) => {
    switch (type) {
      case 'bonus':
      case 'win': return 'default';
      case 'loss':
      case 'entry': return 'destructive';
      default: return 'secondary';
    }
  };

  const getFulfillmentStatusDisplay = (status: string) => {
    switch (status) {
      case 'unfulfilled':
        return { label: 'Processing', icon: Clock, variant: 'secondary' as const };
      case 'ordered':
        return { label: 'Ordered', icon: Package, variant: 'default' as const };
      case 'shipped':
        return { label: 'Shipped', icon: Truck, variant: 'default' as const };
      case 'delivered':
        return { label: 'Delivered', icon: CheckCircle, variant: 'default' as const };
      case 'closed':
        return { label: 'Completed', icon: CheckCircle, variant: 'default' as const };
      case 'cancelled':
        return { label: 'Cancelled', icon: XCircle, variant: 'destructive' as const };
      default:
        return { label: 'Pending', icon: Clock, variant: 'secondary' as const };
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    
    const { error } = await supabase
      .from('profiles')
      .update({
        username,
        country
      })
      .eq('id', user.id);

    if (error) {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
    }

    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    setUploading(true);

    try {
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      toast({
        title: "Avatar updated",
        description: "Your avatar has been updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background pb-20">
      <SEO title="My Profile" description="Manage your WaterSki Predictor profile, avatar, and account preferences." path="/profile" />
      <PageHeader title="Profile" />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Avatar Section */}
        <Card className="p-6">
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="w-24 h-24">
              <AvatarImage src={avatarUrl} />
              <AvatarFallback className="text-2xl">
                {username.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-center gap-2">
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <div className="flex items-center gap-2 text-sm text-primary hover:text-primary/80">
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Uploading...' : 'Change Avatar'}
                </div>
              </Label>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
                disabled={uploading}
              />
            </div>
          </div>
        </Card>

        {/* Token Balance */}
        <Card className="p-6 bg-gradient-water text-primary-foreground">
          <h2 className="text-sm opacity-90 mb-4">Token Balance</h2>
          {walletLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full bg-primary-foreground/20" />
              <Skeleton className="h-8 w-full bg-primary-foreground/20" />
              <Skeleton className="h-10 w-full bg-primary-foreground/20" />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Coins className="w-5 h-5" />
                  Purchased
                </span>
                <span className="text-2xl font-bold">{(wallet?.purchasedTokens ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2">
                  <Coins className="w-5 h-5" />
                  Earned
                </span>
                <span className="text-2xl font-bold">{(wallet?.earnedTokens ?? 0).toLocaleString()}</span>
              </div>
              <div className="pt-2 border-t border-primary-foreground/20">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Total</span>
                  <span className="text-3xl font-bold">
                    {(wallet?.totalBalance ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Lifetime Stats */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">Lifetime Stats</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Deposited</p>
              <p className="text-2xl font-bold text-foreground">
                {lifetimeDeposited.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Rewards Earned</p>
              <p className="text-2xl font-bold text-success">
                +{lifetimeWinnings.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Entries Used</p>
              <p className="text-2xl font-bold text-muted-foreground">
                {lifetimeLosses.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Net Profit</p>
              <p className={`text-2xl font-bold ${
                lifetimeWinnings - lifetimeLosses >= 0 ? 'text-success' : 'text-destructive'
              }`}>
                {lifetimeWinnings - lifetimeLosses >= 0 ? '+' : ''}
                {(lifetimeWinnings - lifetimeLosses).toLocaleString()}
              </p>
            </div>
          </div>
        </Card>

        {/* My Redemptions */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Gift className="w-5 h-5 text-primary" />
            My Redemptions
          </h2>
          {redemptionsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : redemptions.length === 0 ? (
            <div className="text-center py-6">
              <Gift className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No redemptions yet</p>
              <Button 
                variant="outline" 
                className="mt-3"
                onClick={() => navigate('/rewards')}
              >
                Browse Rewards
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {redemptions.map((redemption) => {
                const statusDisplay = getFulfillmentStatusDisplay(redemption.fulfillment_status || 'pending');
                const StatusIcon = statusDisplay.icon;
                
                return (
                  <div 
                    key={redemption.id} 
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                  >
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {redemption.reward_image_url ? (
                        <img 
                          src={redemption.reward_image_url} 
                          alt={redemption.reward_name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Gift className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{redemption.reward_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={statusDisplay.variant} className="text-xs">
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusDisplay.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {format(new Date(redemption.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-semibold text-destructive">
                        -{redemption.tokens_spent.toLocaleString()}
                      </span>
                      <p className="text-xs text-muted-foreground">tokens</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Button 
          variant="outline" 
          className="w-full h-auto py-4"
          onClick={() => navigate('/predictions')}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span className="font-semibold">My Predictions</span>
            </div>
            <span className="text-muted-foreground text-sm">View active & history →</span>
          </div>
        </Button>

        {/* Profile Form */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">Profile Information</h2>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user.email || ''}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Updating...' : 'Update Profile'}
            </Button>
          </form>
        </Card>

        {/* Recent Transactions */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">Recent Transactions</h2>
          {recentTransactions.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">
              No transactions yet
            </p>
          ) : (
            <div className="space-y-3">
              {recentTransactions.map((tx) => (
                <div 
                  key={tx.id} 
                  className="flex items-start justify-between p-3 rounded-lg bg-muted/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={getTransactionBadgeVariant(tx.type)} className="text-xs capitalize">
                          {tx.type}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">
                        {tx.description}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(tx.created_at), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <span className={`font-bold whitespace-nowrap ${
                    tx.amount >= 0 ? 'text-success' : 'text-destructive'
                  }`}>
                    {tx.amount >= 0 ? '+' : ''}{tx.amount.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
          <Button 
            variant="outline" 
            className="w-full mt-4"
            onClick={() => navigate('/transactions')}
          >
            <History className="w-4 h-4 mr-2" />
            View Full Transaction History
          </Button>
        </Card>

        {/* Help & Support */}
        <Card className="p-6">
          <h2 className="text-lg font-bold mb-4">Help & Support</h2>
          <div className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => navigate('/help')}
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Help Center
            </Button>
            <Button 
              variant="outline" 
              className="w-full flex flex-col items-center py-4 h-auto"
              onClick={() => window.open('https://www.instagram.com/waterskipredictor?igsh=MWY1bjViMGxmdzczbw%3D%3D', '_blank')}
            >
              <div className="flex items-center">
                <svg 
                  className="w-5 h-5 mr-2" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                </svg>
                DM us on Instagram
              </div>
              <span className="text-xs text-muted-foreground mt-1">Something not working? Reach out!</span>
            </Button>
            <Button 
              variant="ghost" 
              className="w-full"
              onClick={async () => {
                await resetTutorial();
                startTutorial();
                navigate('/');
              }}
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              Replay Tutorial
            </Button>
          </div>
        </Card>

        {/* Admin Panel Link */}
        {isAdmin && (
          <Button 
            variant="default"
            className="w-full bg-gradient-water"
            onClick={() => navigate('/admin/dashboard')}
          >
            Admin Panel
          </Button>
        )}

        {/* Sign Out */}
        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleSignOut}
        >
          Sign Out
        </Button>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;

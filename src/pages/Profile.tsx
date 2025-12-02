import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Coins, Upload, History, Gift, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [purchasedTokens, setPurchasedTokens] = useState(0);
  const [earnedTokens, setEarnedTokens] = useState(0);
  const [lifetimeDeposited, setLifetimeDeposited] = useState(0);
  const [lifetimeWinnings, setLifetimeWinnings] = useState(0);
  const [lifetimeLosses, setLifetimeLosses] = useState(0);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchProfile();
    fetchWallet();
    fetchLifetimeStats();
    checkAdminStatus();
    fetchRecentTransactions();
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

  const fetchWallet = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('token_wallets')
      .select('purchased_tokens, earned_tokens')
      .eq('user_id', user.id)
      .single();

    if (error) {
      console.error('Error fetching wallet:', error);
      return;
    }

    if (data) {
      setPurchasedTokens(data.purchased_tokens);
      setEarnedTokens(data.earned_tokens);
    }
  };

  const fetchLifetimeStats = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('predictions')
      .select('status, staked_tokens, payout_tokens')
      .eq('user_id', user.id);

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

    for (const prediction of data) {
      const status = String(prediction.status);
      if (status === 'WON') {
        const payout = prediction.payout_tokens ?? 0;
        const winAmount = payout - prediction.staked_tokens;
        if (winAmount > 0) {
          winnings += winAmount;
        }
      } else if (status === 'LOST') {
        losses += prediction.staked_tokens;
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

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'bonus': return <Gift className="w-4 h-4" />;
      case 'win': return <TrendingUp className="w-4 h-4" />;
      case 'loss':
      case 'bet': return <TrendingDown className="w-4 h-4" />;
      default: return <ArrowRightLeft className="w-4 h-4" />;
    }
  };

  const getTransactionBadgeVariant = (type: string) => {
    switch (type) {
      case 'bonus':
      case 'win': return 'default';
      case 'loss':
      case 'bet': return 'destructive';
      default: return 'secondary';
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
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2">
                <Coins className="w-5 h-5" />
                Purchased
              </span>
              <span className="text-2xl font-bold">{purchasedTokens.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="flex items-center gap-2">
                <Coins className="w-5 h-5" />
                Earned
              </span>
              <span className="text-2xl font-bold">{earnedTokens.toLocaleString()}</span>
            </div>
            <div className="pt-2 border-t border-primary-foreground/20">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Total</span>
                <span className="text-3xl font-bold">
                  {(purchasedTokens + earnedTokens).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
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
              <p className="text-sm text-muted-foreground">Winnings</p>
              <p className="text-2xl font-bold text-success">
                +{lifetimeWinnings.toLocaleString()}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Losses</p>
              <p className="text-2xl font-bold text-destructive">
                -{lifetimeLosses.toLocaleString()}
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

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
import { Coins, Upload } from 'lucide-react';

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

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }
    
    fetchProfile();
    fetchWallet();
    checkAdminStatus();
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
      .select('username, country, avatar_url, lifetime_deposited, lifetime_winnings, lifetime_losses')
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
      setLifetimeWinnings(data.lifetime_winnings || 0);
      setLifetimeLosses(data.lifetime_losses || 0);
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

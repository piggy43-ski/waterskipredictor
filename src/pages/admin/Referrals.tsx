import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Download, Search, Users, DollarSign, Gift, TrendingUp, Copy, Check, Pencil, Info, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ReferralCode {
  id: string;
  code: string;
  type: 'regular' | 'influencer';
  bonus_multiplier: number;
  referrer_reward_pct: number;
  reward_type: 'tokens' | 'cash';
  owner_user_id: string | null;
  is_active: boolean;
  max_uses_total: number | null;
  uses_count: number;
  start_at: string | null;
  end_at: string | null;
  notes: string | null;
  created_by_admin: boolean;
  created_at: string;
  // Per-package bonuses
  starter_bonus_pct: number;
  standard_bonus_pct: number;
  pro_bonus_pct: number;
  elite_bonus_pct: number;
  owner?: { username: string | null; email: string | null };
}

interface ReferralRedemption {
  id: string;
  referral_code_id: string;
  referred_user_id: string;
  referrer_user_id: string | null;
  purchase_id: string;
  purchase_amount_tokens: number;
  purchase_amount_usd: number;
  bonus_tokens_awarded: number;
  referrer_reward_value: number;
  referrer_reward_type: 'tokens' | 'cash';
  referrer_paid_at: string | null;
  created_at: string;
  pack_name: string | null;
  referral_code?: { code: string };
  referred_user?: { username: string | null; email: string | null };
  referrer_user?: { username: string | null; email: string | null };
}

interface CodeStats {
  code_id: string;
  signups: number;
  conversions: number;
  revenue_usd: number;
  bonus_tokens_issued: number;
  payout_owed: number;
  payout_paid: number;
}

// Commission rate options (15-30%)
const COMMISSION_RATE_OPTIONS = [
  { value: '0.15', label: '15%' },
  { value: '0.20', label: '20%' },
  { value: '0.25', label: '25%' },
  { value: '0.30', label: '30%' },
];

// Default per-package bonuses for each type
const DEFAULT_BONUSES = {
  regular: { starter: 15, standard: 50, pro: 75, elite: 100 },
  influencer: { starter: 25, standard: 75, pro: 100, elite: 150 },
};

const Referrals = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'regular' | 'influencer'>('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<ReferralCode | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form state for create/edit
  const [formCode, setFormCode] = useState('');
  const [formType, setFormType] = useState<'regular' | 'influencer'>('regular');
  const [formRewardPct, setFormRewardPct] = useState('0.20');
  const [formRewardType, setFormRewardType] = useState<'tokens' | 'cash'>('tokens');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formOwnerUserId, setFormOwnerUserId] = useState('');
  
  // Per-package bonus form state
  const [formStarterBonus, setFormStarterBonus] = useState('15');
  const [formStandardBonus, setFormStandardBonus] = useState('50');
  const [formProBonus, setFormProBonus] = useState('75');
  const [formEliteBonus, setFormEliteBonus] = useState('100');

  // Fetch all referral codes
  const { data: codes = [], isLoading: codesLoading } = useQuery({
    queryKey: ['admin-referral-codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_codes')
        .select('*, owner:profiles!referral_codes_owner_user_id_fkey(username, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ReferralCode[];
    }
  });

  // Fetch redemptions for analytics
  const { data: redemptions = [] } = useQuery({
    queryKey: ['admin-referral-redemptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_redemptions')
        .select(`
          *,
          referral_code:referral_codes(code),
          referred_user:profiles!referral_redemptions_referred_user_id_fkey(username, email),
          referrer_user:profiles!referral_redemptions_referrer_user_id_fkey(username, email)
        `)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ReferralRedemption[];
    }
  });

  // Fetch signup counts per code
  const { data: signupCounts = {} } = useQuery({
    queryKey: ['admin-referral-signups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('referred_by_code_id')
        .not('referred_by_code_id', 'is', null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((p: { referred_by_code_id: string | null }) => {
        if (p.referred_by_code_id) {
          counts[p.referred_by_code_id] = (counts[p.referred_by_code_id] || 0) + 1;
        }
      });
      return counts;
    }
  });

  // Calculate stats per code
  const codeStats: Record<string, CodeStats> = {};
  codes.forEach(code => {
    const codeRedemptions = redemptions.filter(r => r.referral_code_id === code.id);
    codeStats[code.id] = {
      code_id: code.id,
      signups: signupCounts[code.id] || 0,
      conversions: codeRedemptions.length,
      revenue_usd: codeRedemptions.reduce((sum, r) => sum + Number(r.purchase_amount_usd), 0),
      bonus_tokens_issued: codeRedemptions.reduce((sum, r) => sum + r.bonus_tokens_awarded, 0),
      payout_owed: codeRedemptions
        .filter(r => !r.referrer_paid_at)
        .reduce((sum, r) => sum + Number(r.referrer_reward_value), 0),
      payout_paid: codeRedemptions
        .filter(r => r.referrer_paid_at)
        .reduce((sum, r) => sum + Number(r.referrer_reward_value), 0),
    };
  });

  // Create code mutation
  const createCodeMutation = useMutation({
    mutationFn: async (data: {
      code: string;
      type: 'regular' | 'influencer';
      referrer_reward_pct: number;
      reward_type: 'tokens' | 'cash';
      max_uses_total: number | null;
      notes: string | null;
      created_by_admin: boolean;
      starter_bonus_pct: number;
      standard_bonus_pct: number;
      pro_bonus_pct: number;
      elite_bonus_pct: number;
    }) => {
      const { error } = await supabase.from('referral_codes').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-referral-codes'] });
      toast({ title: 'Referral code created' });
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error creating code', description: error.message, variant: 'destructive' });
    }
  });

  // Update code mutation
  const updateCodeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ReferralCode> }) => {
      const { error } = await supabase.from('referral_codes').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-referral-codes'] });
      toast({ title: 'Referral code updated' });
      setEditingCode(null);
      setIsCreateDialogOpen(false);
      resetForm();
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating code', description: error.message, variant: 'destructive' });
    }
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase.from('referral_codes').update({ is_active: isActive }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-referral-codes'] });
    }
  });

  // Delete code mutation
  const deleteCodeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('referral_codes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-referral-codes'] });
      toast({ title: 'Referral code deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error deleting code', description: error.message, variant: 'destructive' });
    }
  });

  // Credit & Pay mutation — actually credits tokens to creator wallet
  const creditAndPayMutation = useMutation({
    mutationFn: async (redemption: ReferralRedemption) => {
      if (!redemption.referrer_user_id) {
        throw new Error('No referrer user ID set on this redemption. Link a creator first.');
      }
      const amount = Math.round(Number(redemption.referrer_reward_value));
      if (amount <= 0) throw new Error('Reward value must be > 0');

      // 1. Credit the creator's wallet
      const { error: rpcError } = await supabase.rpc('increment_earned_tokens', {
        user_id_param: redemption.referrer_user_id,
        amount,
      });
      if (rpcError) throw rpcError;

      // 2. Get updated balance for transaction record
      const { data: walletData } = await supabase
        .from('token_wallets')
        .select('earned_tokens, purchased_tokens')
        .eq('user_id', redemption.referrer_user_id)
        .single();
      const balanceAfter = (walletData?.earned_tokens ?? 0) + (walletData?.purchased_tokens ?? 0);

      // 3. Insert token_transactions record
      const { error: txError } = await supabase.from('token_transactions').insert({
        user_id: redemption.referrer_user_id,
        type: 'bonus',
        amount,
        balance_after: balanceAfter,
        description: `Referral commission (${redemption.referral_code?.code || 'Unknown'}) - ${redemption.pack_name || 'purchase'}`,
        reference_type: 'referral_reward',
        reference_id: redemption.id,
      });
      if (txError) throw txError;

      // 4. Mark as paid
      const { error: updateError } = await supabase
        .from('referral_redemptions')
        .update({ referrer_paid_at: new Date().toISOString() })
        .eq('id', redemption.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-referral-redemptions'] });
      toast({ title: 'Creator credited & marked as paid' });
    },
    onError: (error: Error) => {
      toast({ title: 'Credit failed', description: error.message, variant: 'destructive' });
    }
  });

  const resetForm = () => {
    setFormCode('');
    setFormType('regular');
    setFormRewardPct('0.20');
    setFormRewardType('tokens');
    setFormMaxUses('');
    setFormNotes('');
    setFormOwnerUserId('');
    setFormStarterBonus('15');
    setFormStandardBonus('50');
    setFormProBonus('75');
    setFormEliteBonus('100');
    setEditingCode(null);
  };

  const openEditDialog = (code: ReferralCode) => {
    setEditingCode(code);
    setFormCode(code.code);
    setFormType(code.type);
    setFormRewardPct(String(code.referrer_reward_pct));
    setFormRewardType(code.reward_type);
    setFormMaxUses(code.max_uses_total ? String(code.max_uses_total) : '');
    setFormNotes(code.notes || '');
    setFormOwnerUserId(code.owner_user_id || '');
    // Per-package bonuses (convert decimal to percentage)
    setFormStarterBonus(String((code.starter_bonus_pct || 0.15) * 100));
    setFormStandardBonus(String((code.standard_bonus_pct || 0.50) * 100));
    setFormProBonus(String((code.pro_bonus_pct || 0.75) * 100));
    setFormEliteBonus(String((code.elite_bonus_pct || 1.00) * 100));
    setIsCreateDialogOpen(true);
  };

  const applyDefaults = (type: 'regular' | 'influencer') => {
    const defaults = DEFAULT_BONUSES[type];
    setFormStarterBonus(String(defaults.starter));
    setFormStandardBonus(String(defaults.standard));
    setFormProBonus(String(defaults.pro));
    setFormEliteBonus(String(defaults.elite));
  };

  const handleSubmit = () => {
    const data: any = {
      code: formCode.toUpperCase().trim(),
      type: formType,
      referrer_reward_pct: parseFloat(formRewardPct),
      reward_type: formRewardType,
      max_uses_total: formMaxUses ? parseInt(formMaxUses) : null,
      notes: formNotes || null,
      created_by_admin: true,
      owner_user_id: formOwnerUserId.trim() || null,
      // Convert percentage to decimal
      starter_bonus_pct: parseFloat(formStarterBonus) / 100,
      standard_bonus_pct: parseFloat(formStandardBonus) / 100,
      pro_bonus_pct: parseFloat(formProBonus) / 100,
      elite_bonus_pct: parseFloat(formEliteBonus) / 100,
    };

    if (editingCode) {
      updateCodeMutation.mutate({ id: editingCode.id, data });
    } else {
      createCodeMutation.mutate(data);
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const exportCSV = (type: 'codes' | 'payouts') => {
    let csv = '';
    if (type === 'codes') {
      csv = 'Code,Type,Starter Bonus,Standard Bonus,Pro Bonus,Elite Bonus,Commission %,Commission Type,Active,Signups,Conversions,Revenue USD,Payout Owed\n';
      codes.forEach(code => {
        const stats = codeStats[code.id];
        csv += `${code.code},${code.type},${(code.starter_bonus_pct * 100).toFixed(0)}%,${(code.standard_bonus_pct * 100).toFixed(0)}%,${(code.pro_bonus_pct * 100).toFixed(0)}%,${(code.elite_bonus_pct * 100).toFixed(0)}%,${(code.referrer_reward_pct * 100).toFixed(0)}%,${code.reward_type},${code.is_active},${stats.signups},${stats.conversions},${stats.revenue_usd.toFixed(2)},${stats.payout_owed.toFixed(2)}\n`;
      });
    } else {
      csv = 'Code,Referrer,Reward Type,Reward Value,Paid\n';
      redemptions
        .filter(r => !r.referrer_paid_at && r.referrer_reward_value > 0)
        .forEach(r => {
          csv += `${r.referral_code?.code || 'N/A'},${r.referrer_user?.username || r.referrer_user?.email || 'N/A'},${r.referrer_reward_type},${r.referrer_reward_value},No\n`;
        });
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = type === 'codes' ? 'referral_codes.csv' : 'pending_payouts.csv';
    a.click();
  };

  // Filter codes
  const filteredCodes = codes.filter(code => {
    const matchesSearch = code.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      code.notes?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || code.type === typeFilter;
    return matchesSearch && matchesType;
  });

  // Summary stats
  const totalSignups = Object.values(codeStats).reduce((sum, s) => sum + s.signups, 0);
  const totalRevenue = Object.values(codeStats).reduce((sum, s) => sum + s.revenue_usd, 0);
  const totalBonusTokens = Object.values(codeStats).reduce((sum, s) => sum + s.bonus_tokens_issued, 0);
  const totalPayoutOwed = Object.values(codeStats).reduce((sum, s) => sum + s.payout_owed, 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Referral Codes</h1>
            <p className="text-muted-foreground">Manage referral codes and track influencer payouts</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
            setIsCreateDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); }}>
                <Plus className="w-4 h-4 mr-2" />
                Create Code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingCode ? 'Edit Referral Code' : 'Create Referral Code'}</DialogTitle>
                <DialogDescription>
                  {editingCode 
                    ? `Updating ${editingCode.code}. Changes apply to future purchases only.`
                    : 'Create a new referral code for users or influencers'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input 
                    value={formCode} 
                    onChange={e => setFormCode(e.target.value.toUpperCase())}
                    placeholder="WATERDAVE"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={(v: 'regular' | 'influencer') => {
                    setFormType(v);
                    applyDefaults(v);
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="influencer">Influencer / Creator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Per-Package Bonuses Section */}
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold">User Bonuses (First Purchase)</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>These bonuses REPLACE base package discounts. User gets referral bonus OR base discount, never both.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">Extra tokens granted on user's first purchase (overrides base discounts)</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-sm">Starter ($25)</Label>
                      <div className="flex items-center gap-1">
                        <Input 
                          type="number" 
                          value={formStarterBonus} 
                          onChange={e => setFormStarterBonus(e.target.value)}
                          className="h-9"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Standard ($50)</Label>
                      <div className="flex items-center gap-1">
                        <Input 
                          type="number" 
                          value={formStandardBonus} 
                          onChange={e => setFormStandardBonus(e.target.value)}
                          className="h-9"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Pro ($100)</Label>
                      <div className="flex items-center gap-1">
                        <Input 
                          type="number" 
                          value={formProBonus} 
                          onChange={e => setFormProBonus(e.target.value)}
                          className="h-9"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-sm">Elite ($250)</Label>
                      <div className="flex items-center gap-1">
                        <Input 
                          type="number" 
                          value={formEliteBonus} 
                          onChange={e => setFormEliteBonus(e.target.value)}
                          className="h-9"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Creator Commission Section */}
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <Label className="text-base font-semibold">Creator Commission</Label>
                  <p className="text-xs text-muted-foreground">Calculated on cash spent only (bonus tokens excluded)</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-sm">Commission Type</Label>
                      <Select value={formRewardType} onValueChange={(v: 'tokens' | 'cash') => setFormRewardType(v)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="tokens">Tokens</SelectItem>
                          <SelectItem value="cash">Cash (USD)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Commission Rate</Label>
                      <Select value={formRewardPct} onValueChange={setFormRewardPct}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COMMISSION_RATE_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Max Uses (optional)</Label>
                    <Input 
                      type="number" 
                      value={formMaxUses} 
                      onChange={e => setFormMaxUses(e.target.value)}
                      placeholder="Unlimited"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Owner User ID (optional)</Label>
                  <Input 
                    value={formOwnerUserId} 
                    onChange={e => setFormOwnerUserId(e.target.value)}
                    placeholder="Paste user UUID to link creator account"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">Links this code to a user for automatic commission payouts</p>
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Textarea 
                    value={formNotes} 
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Internal notes about this code..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit} disabled={!formCode.trim()}>
                  {editingCode ? 'Update Code' : 'Create Code'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Referred Signups</p>
                  <p className="text-2xl font-bold">{totalSignups}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Revenue Generated</p>
                  <p className="text-2xl font-bold">${totalRevenue.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Bonus Tokens Given</p>
                  <p className="text-2xl font-bold">{totalBonusTokens.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Payouts Owed</p>
                  <p className="text-2xl font-bold">${totalPayoutOwed.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="codes">
          <TabsList>
            <TabsTrigger value="codes">Codes</TabsTrigger>
            <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
            <TabsTrigger value="payouts">Pending Payouts</TabsTrigger>
          </TabsList>

          <TabsContent value="codes" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input 
                  placeholder="Search codes..." 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={(v: 'all' | 'regular' | 'influencer') => setTypeFilter(v)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="influencer">Influencer</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => exportCSV('codes')}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>

            {/* Codes Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>User Bonuses</TableHead>
                      <TableHead>Commission</TableHead>
                      <TableHead>Signups</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codesLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
                      </TableRow>
                    ) : filteredCodes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No referral codes found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredCodes.map(code => {
                        const stats = codeStats[code.id];
                        return (
                          <TableRow key={code.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-semibold">{code.code}</span>
                                <button 
                                  onClick={() => copyCode(code.code)}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  {copiedCode === code.code ? (
                                    <Check className="w-4 h-4 text-green-500" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={code.type === 'influencer' ? 'default' : 'secondary'}>
                                {code.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger className="text-left">
                                  <span className="text-sm">
                                    {((code.starter_bonus_pct || 0.15) * 100).toFixed(0)}% / {((code.standard_bonus_pct || 0.50) * 100).toFixed(0)}% / {((code.pro_bonus_pct || 0.75) * 100).toFixed(0)}% / {((code.elite_bonus_pct || 1.00) * 100).toFixed(0)}%
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs space-y-1">
                                    <p>Starter: +{((code.starter_bonus_pct || 0.15) * 100).toFixed(0)}%</p>
                                    <p>Standard: +{((code.standard_bonus_pct || 0.50) * 100).toFixed(0)}%</p>
                                    <p>Pro: +{((code.pro_bonus_pct || 0.75) * 100).toFixed(0)}%</p>
                                    <p>Elite: +{((code.elite_bonus_pct || 1.00) * 100).toFixed(0)}%</p>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              {(code.referrer_reward_pct * 100).toFixed(0)}% {code.reward_type}
                            </TableCell>
                            <TableCell>
                              {stats.signups}
                              {stats.conversions > 0 && (
                                <span className="text-muted-foreground text-xs ml-1">
                                  ({stats.conversions} conv)
                                </span>
                              )}
                            </TableCell>
                            <TableCell>${stats.revenue_usd.toFixed(2)}</TableCell>
                            <TableCell>
                              <Switch 
                                checked={code.is_active}
                                onCheckedChange={checked => toggleActiveMutation.mutate({ id: code.id, isActive: checked })}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={() => openEditDialog(code)}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete referral code "{code.code}"?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently remove this code. Existing redemptions will be preserved but the code will no longer be usable.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteCodeMutation.mutate(code.id)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
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
          </TabsContent>

          <TabsContent value="redemptions">
            <Card>
              <CardHeader>
                <CardTitle>All Redemptions</CardTitle>
                <CardDescription>Complete history of referral bonus applications</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Pack</TableHead>
                      <TableHead>Purchase</TableHead>
                      <TableHead>Bonus</TableHead>
                      <TableHead>Creator Reward</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No redemptions yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      redemptions.map(r => (
                        <TableRow key={r.id}>
                          <TableCell>{format(new Date(r.created_at), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="font-mono">{r.referral_code?.code || 'N/A'}</TableCell>
                          <TableCell>{r.referred_user?.username || r.referred_user?.email || 'Unknown'}</TableCell>
                          <TableCell>{r.pack_name || '-'}</TableCell>
                          <TableCell>
                            {r.purchase_amount_tokens} tokens (${Number(r.purchase_amount_usd).toFixed(2)})
                          </TableCell>
                          <TableCell className="text-green-600">+{r.bonus_tokens_awarded.toLocaleString()}</TableCell>
                          <TableCell>
                            {r.referrer_reward_type === 'cash' 
                              ? `$${Number(r.referrer_reward_value).toFixed(2)}`
                              : `${Math.round(Number(r.referrer_reward_value)).toLocaleString()} tokens`
                            }
                            {r.referrer_paid_at ? (
                              <Badge className="ml-2 bg-green-600 text-white">Credited</Badge>
                            ) : r.referrer_reward_value > 0 ? (
                              <Badge variant="destructive" className="ml-2">Unpaid</Badge>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payouts">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Pending Payouts</CardTitle>
                  <CardDescription>Unpaid creator rewards (mark as paid after processing)</CardDescription>
                </div>
                <Button variant="outline" onClick={() => exportCSV('payouts')}>
                  <Download className="w-4 h-4 mr-2" />
                  Export Pending
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Creator</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.filter(r => !r.referrer_paid_at && r.referrer_reward_value > 0).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No pending payouts
                        </TableCell>
                      </TableRow>
                    ) : (
                      redemptions
                        .filter(r => !r.referrer_paid_at && r.referrer_reward_value > 0)
                        .map(r => (
                          <TableRow key={r.id}>
                            <TableCell>{format(new Date(r.created_at), 'MMM d, yyyy')}</TableCell>
                            <TableCell className="font-mono">{r.referral_code?.code || 'N/A'}</TableCell>
                            <TableCell>{r.referrer_user?.username || r.referrer_user?.email || 'Unknown'}</TableCell>
                            <TableCell>
                              <Badge variant={r.referrer_reward_type === 'cash' ? 'default' : 'secondary'}>
                                {r.referrer_reward_type}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold">
                              {r.referrer_reward_type === 'cash' 
                                ? `$${Number(r.referrer_reward_value).toFixed(2)}`
                                : `${Math.round(Number(r.referrer_reward_value)).toLocaleString()} tokens`
                              }
                            </TableCell>
                            <TableCell>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => creditAndPayMutation.mutate(r)}
                                disabled={creditAndPayMutation.isPending}
                              >
                                {creditAndPayMutation.isPending ? 'Crediting...' : 'Credit & Pay'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
};

export default Referrals;

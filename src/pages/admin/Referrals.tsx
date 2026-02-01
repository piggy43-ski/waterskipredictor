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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Download, Search, Users, DollarSign, Gift, TrendingUp, Copy, Check, Pencil } from 'lucide-react';
import { format } from 'date-fns';

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
  const [formBonusMultiplier, setFormBonusMultiplier] = useState('1.5');
  const [formRewardPct, setFormRewardPct] = useState('0.20');
  const [formRewardType, setFormRewardType] = useState<'tokens' | 'cash'>('tokens');
  const [formMaxUses, setFormMaxUses] = useState('');
  const [formNotes, setFormNotes] = useState('');

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
      bonus_multiplier: number;
      referrer_reward_pct: number;
      reward_type: 'tokens' | 'cash';
      max_uses_total: number | null;
      notes: string | null;
      created_by_admin: boolean;
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
    mutationFn: async ({ id, data }: { id: string; data: {
      code?: string;
      type?: 'regular' | 'influencer';
      bonus_multiplier?: number;
      referrer_reward_pct?: number;
      reward_type?: 'tokens' | 'cash';
      max_uses_total?: number | null;
      notes?: string | null;
    } }) => {
      const { error } = await supabase.from('referral_codes').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-referral-codes'] });
      toast({ title: 'Referral code updated' });
      setEditingCode(null);
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

  // Mark payout as paid mutation
  const markPaidMutation = useMutation({
    mutationFn: async (redemptionIds: string[]) => {
      const { error } = await supabase
        .from('referral_redemptions')
        .update({ referrer_paid_at: new Date().toISOString() })
        .in('id', redemptionIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-referral-redemptions'] });
      toast({ title: 'Payouts marked as paid' });
    }
  });

  const resetForm = () => {
    setFormCode('');
    setFormType('regular');
    setFormBonusMultiplier('1.5');
    setFormRewardPct('0.20');
    setFormRewardType('tokens');
    setFormMaxUses('');
    setFormNotes('');
  };

  const openEditDialog = (code: ReferralCode) => {
    setEditingCode(code);
    setFormCode(code.code);
    setFormType(code.type);
    setFormBonusMultiplier(String(code.bonus_multiplier));
    setFormRewardPct(String(code.referrer_reward_pct));
    setFormRewardType(code.reward_type);
    setFormMaxUses(code.max_uses_total ? String(code.max_uses_total) : '');
    setFormNotes(code.notes || '');
  };

  const handleSubmit = () => {
    const data = {
      code: formCode.toUpperCase().trim(),
      type: formType,
      bonus_multiplier: parseFloat(formBonusMultiplier),
      referrer_reward_pct: parseFloat(formRewardPct),
      reward_type: formRewardType,
      max_uses_total: formMaxUses ? parseInt(formMaxUses) : null,
      notes: formNotes || null,
      created_by_admin: true,
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
      csv = 'Code,Type,Bonus Multiplier,Reward %,Reward Type,Active,Signups,Conversions,Revenue USD,Bonus Tokens,Payout Owed\n';
      codes.forEach(code => {
        const stats = codeStats[code.id];
        csv += `${code.code},${code.type},${code.bonus_multiplier},${code.referrer_reward_pct * 100}%,${code.reward_type},${code.is_active},${stats.signups},${stats.conversions},${stats.revenue_usd.toFixed(2)},${stats.bonus_tokens_issued},${stats.payout_owed.toFixed(2)}\n`;
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
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { resetForm(); setEditingCode(null); }}>
                <Plus className="w-4 h-4 mr-2" />
                Create Code
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Referral Code</DialogTitle>
                <DialogDescription>Create a new referral code for users or influencers</DialogDescription>
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
                    setFormBonusMultiplier(v === 'influencer' ? '2.0' : '1.5');
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular (+50% bonus)</SelectItem>
                      <SelectItem value="influencer">Influencer (+100% bonus)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bonus Multiplier</Label>
                    <Input 
                      type="number" 
                      step="0.1" 
                      value={formBonusMultiplier} 
                      onChange={e => setFormBonusMultiplier(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">1.5 = +50%, 2.0 = +100%</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Referrer Reward %</Label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      value={formRewardPct} 
                      onChange={e => setFormRewardPct(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">0.20 = 20%</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reward Type</Label>
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
                <Button onClick={handleSubmit} disabled={!formCode.trim()}>Create Code</Button>
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
                      <TableHead>Bonus</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead>Signups</TableHead>
                      <TableHead>Conversions</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codesLoading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8">Loading...</TableCell>
                      </TableRow>
                    ) : filteredCodes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
                            <TableCell>+{((code.bonus_multiplier - 1) * 100).toFixed(0)}%</TableCell>
                            <TableCell>
                              {(code.referrer_reward_pct * 100).toFixed(0)}% {code.reward_type}
                            </TableCell>
                            <TableCell>{stats.signups}</TableCell>
                            <TableCell>
                              {stats.conversions}
                              {stats.signups > 0 && (
                                <span className="text-muted-foreground text-xs ml-1">
                                  ({((stats.conversions / stats.signups) * 100).toFixed(0)}%)
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
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => {
                                  openEditDialog(code);
                                  setIsCreateDialogOpen(true);
                                }}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
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
                      <TableHead>Referred User</TableHead>
                      <TableHead>Purchase</TableHead>
                      <TableHead>Bonus Tokens</TableHead>
                      <TableHead>Referrer Reward</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {redemptions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No redemptions yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      redemptions.map(r => (
                        <TableRow key={r.id}>
                          <TableCell>{format(new Date(r.created_at), 'MMM d, yyyy')}</TableCell>
                          <TableCell className="font-mono">{r.referral_code?.code || 'N/A'}</TableCell>
                          <TableCell>{r.referred_user?.username || r.referred_user?.email || 'Unknown'}</TableCell>
                          <TableCell>
                            {r.purchase_amount_tokens} tokens (${Number(r.purchase_amount_usd).toFixed(2)})
                          </TableCell>
                          <TableCell className="text-green-600">+{r.bonus_tokens_awarded}</TableCell>
                          <TableCell>
                            {r.referrer_reward_type === 'cash' ? '$' : ''}
                            {Number(r.referrer_reward_value).toFixed(2)}
                            {r.referrer_reward_type === 'tokens' ? ' tokens' : ''}
                            {r.referrer_paid_at && (
                              <Badge variant="outline" className="ml-2">Paid</Badge>
                            )}
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
                  <CardDescription>Unpaid referrer rewards (mark as paid after processing)</CardDescription>
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
                      <TableHead>Referrer</TableHead>
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
                              {r.referrer_reward_type === 'cash' ? '$' : ''}
                              {Number(r.referrer_reward_value).toFixed(2)}
                              {r.referrer_reward_type === 'tokens' ? ' tokens' : ''}
                            </TableCell>
                            <TableCell>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => markPaidMutation.mutate([r.id])}
                              >
                                Mark Paid
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

        {/* Edit Dialog */}
        {editingCode && (
          <Dialog open={!!editingCode} onOpenChange={() => setEditingCode(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Referral Code</DialogTitle>
                <DialogDescription>Update settings for {editingCode.code}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input 
                    value={formCode} 
                    onChange={e => setFormCode(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={formType} onValueChange={(v: 'regular' | 'influencer') => setFormType(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="influencer">Influencer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Bonus Multiplier</Label>
                    <Input 
                      type="number" 
                      step="0.1" 
                      value={formBonusMultiplier} 
                      onChange={e => setFormBonusMultiplier(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Referrer Reward %</Label>
                    <Input 
                      type="number" 
                      step="0.01" 
                      value={formRewardPct} 
                      onChange={e => setFormRewardPct(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Reward Type</Label>
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
                    <Label>Max Uses</Label>
                    <Input 
                      type="number" 
                      value={formMaxUses} 
                      onChange={e => setFormMaxUses(e.target.value)}
                      placeholder="Unlimited"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea 
                    value={formNotes} 
                    onChange={e => setFormNotes(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditingCode(null)}>Cancel</Button>
                <Button onClick={handleSubmit}>Save Changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </AdminLayout>
  );
};

export default Referrals;

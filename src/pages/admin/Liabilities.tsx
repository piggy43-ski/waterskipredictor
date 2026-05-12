import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Package, User, DollarSign, Clock, Check, Truck, X, FileText, Copy, ShoppingBag, Factory, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';

type Liability = {
  id: string;
  redemption_id: string;
  reward_id: string;
  user_id: string;
  token_cost: number;
  usd_estimated_cost: number | null;
  fulfillment_type: string;
  partner: string;
  status: string;
  notes: string | null;
  fulfilled_at: string | null;
  created_at: string;
};

type RewardInfo = {
  id: string;
  name: string;
  category?: string | null;
};

type UserInfo = {
  id: string;
  username: string;
  email: string;
};

const STATUS_OPTIONS = [
  { value: 'unfulfilled', label: 'Unfulfilled', color: 'bg-yellow-500' },
  { value: 'ordered', label: 'Ordered', color: 'bg-blue-500' },
  { value: 'shipped', label: 'Shipped', color: 'bg-purple-500' },
  { value: 'delivered', label: 'Delivered', color: 'bg-green-500' },
  { value: 'closed', label: 'Closed', color: 'bg-muted' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-destructive' },
];

const FULFILLMENT_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'digital', label: 'Digital' },
  { value: 'physical', label: 'Physical' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'vip', label: 'VIP' },
];

export default function AdminLiabilities() {
  const [statusFilter, setStatusFilter] = useState('unfulfilled');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedLiability, setSelectedLiability] = useState<Liability | null>(null);
  const [fulfillDialogOpen, setFulfillDialogOpen] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [shopifyOrderId, setShopifyOrderId] = useState('');
  const [shopifyOrderUrl, setShopifyOrderUrl] = useState('');
  const [shopifyGiftCardId, setShopifyGiftCardId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [carrier, setCarrier] = useState('');
  const [supplier, setSupplier] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch liabilities
  const { data: liabilities, isLoading } = useQuery({
    queryKey: ['admin-liabilities', statusFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('house_rewards_liability')
        .select('*')
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (typeFilter !== 'all') {
        query = query.eq('fulfillment_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Liability[];
    },
  });

  // Fetch rewards for names
  const { data: rewards } = useQuery({
    queryKey: ['rewards-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rewards')
        .select('id, name, category');
      if (error) throw error;
      return data as RewardInfo[];
    },
  });

  // Fetch users for names
  const { data: users } = useQuery({
    queryKey: ['users-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, email');
      if (error) throw error;
      return data as UserInfo[];
    },
  });

  // Summary stats
  const { data: summary } = useQuery({
    queryKey: ['liability-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('house_rewards_liability')
        .select('status, usd_estimated_cost');
      
      if (error) throw error;

      const unfulfilled = data?.filter(l => l.status === 'unfulfilled') || [];
      const totalPending = unfulfilled.length;
      const totalUsdPending = unfulfilled.reduce((sum, l) => sum + (l.usd_estimated_cost || 0), 0);

      return { totalPending, totalUsdPending };
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      // Get before state
      const { data: beforeData } = await supabase
        .from('house_rewards_liability')
        .select('*')
        .eq('id', id)
        .single();

      const updates: Record<string, any> = { status };
      
      if (status === 'delivered' || status === 'closed') {
        updates.fulfilled_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('house_rewards_liability')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      // Get after state and current user
      const { data: afterData } = await supabase
        .from('house_rewards_liability')
        .select('*')
        .eq('id', id)
        .single();
      const { data: { user } } = await supabase.auth.getUser();

      // Write audit log
      await supabase.from('audit_logs').insert({
        actor_type: 'admin',
        actor_id: user?.id || null,
        action_type: 'REDEMPTION_STATUS_UPDATED',
        entity_type: 'redemption',
        entity_id: beforeData?.redemption_id || id,
        before_state: { status: beforeData?.status },
        after_state: { status: afterData?.status },
        metadata: { liability_id: id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['liability-summary'] });
      toast({ title: 'Status updated' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error updating status', description: error.message, variant: 'destructive' });
    },
  });

  // Update notes mutation
  // Save fulfillment workflow (notes on liability + Shopify/manual fields on redemption)
  const saveFulfillmentMutation = useMutation({
    mutationFn: async ({ liability }: { liability: Liability }) => {
      const { error: notesErr } = await supabase
        .from('house_rewards_liability')
        .update({ notes: notesText })
        .eq('id', liability.id);
      if (notesErr) throw notesErr;

      const { error: redErr } = await supabase
        .from('redemptions')
        .update({
          shopify_order_id: shopifyOrderId || null,
          shopify_order_url: shopifyOrderUrl || null,
          shopify_gift_card_id: shopifyGiftCardId || null,
          tracking_number: trackingNumber || null,
          carrier: carrier || null,
          supplier: supplier || null,
          order_reference: orderReference || null,
          estimated_arrival_date: estimatedArrival || null,
        })
        .eq('id', liability.redemption_id);
      if (redErr) throw redErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-liabilities'] });
      setFulfillDialogOpen(false);
      setSelectedLiability(null);
      toast({ title: 'Fulfillment saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving fulfillment', description: error.message, variant: 'destructive' });
    },
  });

  const getRewardName = (rewardId: string) => {
    return rewards?.find(r => r.id === rewardId)?.name || 'Unknown';
  };

  const getUserDisplay = (userId: string) => {
    const user = users?.find(u => u.id === userId);
    return user?.username || user?.email || userId.slice(0, 8);
  };

  const getStatusBadge = (status: string) => {
    const option = STATUS_OPTIONS.find(o => o.value === status);
    return (
      <Badge className={`${option?.color || 'bg-muted'} text-white`}>
        {option?.label || status}
      </Badge>
    );
  };

  const openFulfillDialog = async (liability: Liability) => {
    setSelectedLiability(liability);
    setNotesText(liability.notes || '');
    // Load existing redemption fields
    const { data } = await supabase
      .from('redemptions')
      .select('shopify_order_id, shopify_order_url, shopify_gift_card_id, tracking_number, carrier, supplier, order_reference, estimated_arrival_date')
      .eq('id', liability.redemption_id)
      .maybeSingle();
    setShopifyOrderId(data?.shopify_order_id || '');
    setShopifyOrderUrl(data?.shopify_order_url || '');
    setShopifyGiftCardId(data?.shopify_gift_card_id || '');
    setTrackingNumber(data?.tracking_number || '');
    setCarrier(data?.carrier || '');
    // Auto-set supplier for elite_skis from reward partner if blank
    const reward = rewards?.find(r => r.id === liability.reward_id);
    setSupplier(data?.supplier || (reward?.category === 'elite_skis' ? (reward?.partner ?? '') : ''));
    setOrderReference(data?.order_reference || '');
    setEstimatedArrival(data?.estimated_arrival_date || '');
    setFulfillDialogOpen(true);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const getRewardCategory = (rewardId: string) =>
    rewards?.find(r => r.id === rewardId)?.category || null;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Reward Liabilities</h2>
          <p className="text-muted-foreground mt-1">Track and fulfill reward redemptions</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Fulfillments</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary?.totalPending || 0}</div>
              <p className="text-xs text-muted-foreground">Awaiting action</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending USD Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(summary?.totalUsdPending || 0).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Estimated fulfillment cost</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4">
              <div className="w-48">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-48">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    {FULFILLMENT_TYPES.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liabilities Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-muted-foreground">Loading...</div>
            ) : liabilities && liabilities.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Reward</TableHead>
                    <TableHead>Partner</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Tokens</TableHead>
                    <TableHead>USD Est.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liabilities.map((liability) => (
                    <TableRow key={liability.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{getUserDisplay(liability.user_id)}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getRewardName(liability.reward_id)}</TableCell>
                      <TableCell>{liability.partner}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {liability.fulfillment_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{liability.token_cost.toLocaleString()}</TableCell>
                      <TableCell>
                        {liability.usd_estimated_cost 
                          ? `$${liability.usd_estimated_cost.toFixed(2)}` 
                          : '-'}
                      </TableCell>
                      <TableCell>{getStatusBadge(liability.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(liability.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Select
                            value={liability.status}
                            onValueChange={(value) => 
                              updateStatusMutation.mutate({ id: liability.id, status: value })
                            }
                          >
                            <SelectTrigger className="w-28 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openNotesDialog(liability)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-muted-foreground text-center">
                No liabilities found for the selected filters.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notes Dialog */}
        <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add/Edit Notes</DialogTitle>
            </DialogHeader>
            <Textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder="Add fulfillment notes, tracking numbers, etc."
              rows={4}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotesDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => selectedLiability && updateNotesMutation.mutate({ 
                  id: selectedLiability.id, 
                  notes: notesText 
                })}
                disabled={updateNotesMutation.isPending}
              >
                Save Notes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

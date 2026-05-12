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

type RedemptionDetails = {
  id: string;
  fulfillment_status: string | null;
  shipping_name: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  shipping_phone: string | null;
  glove_size: string | null;
  gift_card_email: string | null;
  shopify_order_id: string | null;
  shopify_order_url: string | null;
  shopify_gift_card_id: string | null;
  tracking_number: string | null;
  carrier: string | null;
  supplier: string | null;
  order_reference: string | null;
  estimated_arrival_date: string | null;
};

type RewardInfo = {
  id: string;
  name: string;
  category?: string | null;
  partner?: string | null;
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
  const [giftCardCode, setGiftCardCode] = useState('');
  const [redemptionDetails, setRedemptionDetails] = useState<RedemptionDetails | null>(null);
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
        .select('id, name, category, partner');
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

  // Status transition mutation (Mark Shipped / Mark Fulfilled)
  const transitionMutation = useMutation({
    mutationFn: async ({ liability, toStatus }: { liability: Liability; toStatus: 'shipped' | 'fulfilled' }) => {
      // Persist any pending fulfillment fields first
      const { error: redErr } = await supabase
        .from('redemptions')
        .update({
          fulfillment_status: toStatus,
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

      const liabilityStatus = toStatus === 'shipped' ? 'shipped' : 'delivered';
      const liabilityUpdates: Record<string, any> = { status: liabilityStatus, notes: notesText };
      if (toStatus === 'fulfilled') liabilityUpdates.fulfilled_at = new Date().toISOString();
      await supabase.from('house_rewards_liability').update(liabilityUpdates).eq('id', liability.id);

      // Look up user + reward for email
      const userInfo = users?.find(u => u.id === liability.user_id);
      const reward = rewards?.find(r => r.id === liability.reward_id);
      if (userInfo?.email) {
        const type = toStatus === 'shipped' ? 'redemption_shipped' : 'redemption_fulfilled';
        await supabase.functions.invoke('send-email', {
          body: {
            type,
            to: userInfo.email,
            userId: liability.user_id,
            data: {
              username: userInfo.username || 'Champion',
              rewardName: reward?.name || 'Reward',
              redemptionId: liability.redemption_id,
              trackingNumber: trackingNumber || null,
              carrier: carrier || null,
              giftCardCode: toStatus === 'fulfilled' ? (giftCardCode || null) : null,
            },
          },
        }).catch(e => console.error('email send failed', e));
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['liability-summary'] });
      setFulfillDialogOpen(false);
      setSelectedLiability(null);
      toast({ title: vars.toStatus === 'shipped' ? 'Marked shipped' : 'Marked fulfilled' });
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // Cancel & Refund mutation
  const refundMutation = useMutation({
    mutationFn: async ({ liability, reason }: { liability: Liability; reason: string }) => {
      const { error } = await supabase.rpc('refund_redemption', {
        p_redemption_id: liability.redemption_id,
        p_reason: reason,
      });
      if (error) throw error;

      const userInfo = users?.find(u => u.id === liability.user_id);
      const reward = rewards?.find(r => r.id === liability.reward_id);
      if (userInfo?.email) {
        await supabase.functions.invoke('send-email', {
          body: {
            type: 'redemption_cancelled',
            to: userInfo.email,
            userId: liability.user_id,
            data: {
              username: userInfo.username || 'Champion',
              rewardName: reward?.name || 'Reward',
              tokensRefunded: liability.token_cost,
              reason,
              redemptionId: liability.redemption_id,
            },
          },
        }).catch(e => console.error('email send failed', e));
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['liability-summary'] });
      setFulfillDialogOpen(false);
      setSelectedLiability(null);
      toast({ title: 'Refunded', description: 'Tokens returned to user' });
    },
    onError: (e: Error) => toast({ title: 'Refund failed', description: e.message, variant: 'destructive' }),
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
      .select('shopify_order_id, shopify_order_url, shopify_gift_card_id, tracking_number, carrier, supplier, order_reference, estimated_arrival_date, shipping_name, shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_zip, shipping_phone, glove_size, gift_card_email, fulfillment_status')
      .eq('id', liability.redemption_id)
      .maybeSingle();
    setRedemptionDetails(data as RedemptionDetails | null);
    setShopifyOrderId(data?.shopify_order_id || '');
    setShopifyOrderUrl(data?.shopify_order_url || '');
    setShopifyGiftCardId(data?.shopify_gift_card_id || '');
    setTrackingNumber(data?.tracking_number || '');
    setCarrier(data?.carrier || '');
    setGiftCardCode('');
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
                            onClick={() => openFulfillDialog(liability)}
                          >
                            <Package className="h-4 w-4" />
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

        {/* Fulfillment Dialog */}
        <Dialog open={fulfillDialogOpen} onOpenChange={setFulfillDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Fulfillment · {selectedLiability && getRewardName(selectedLiability.reward_id)}
              </DialogTitle>
            </DialogHeader>
            {selectedLiability && (() => {
              const cat = getRewardCategory(selectedLiability.reward_id);
              const userInfo = users?.find(u => u.id === selectedLiability.user_id);
              const reward = rewards?.find(r => r.id === selectedLiability.reward_id);
              const isShopify = cat === 'gear' || cat === 'store_credit';
              const isManual = cat === 'elite_skis';
              const r = redemptionDetails;
              const shippingBlock = r?.shipping_name
                ? `Name: ${r.shipping_name}\nAddress: ${r.shipping_address_line1}${r.shipping_address_line2 ? ', ' + r.shipping_address_line2 : ''}\n${r.shipping_city}, ${r.shipping_state} ${r.shipping_zip}\nPhone: ${r.shipping_phone}${r.glove_size ? '\nGlove size: ' + r.glove_size : ''}`
                : (r?.gift_card_email ? `Gift card delivery email: ${r.gift_card_email}` : '');
              const customerPayload = `Name: ${userInfo?.username || '—'}\nEmail: ${userInfo?.email || '—'}\nUser ID: ${selectedLiability.user_id}${shippingBlock ? '\n\n' + shippingBlock : ''}`;
              const orderPayload = `Product: ${reward?.name}\nPartner: ${reward?.partner}\nCustomer email: ${userInfo?.email || '—'}\nRedemption: ${selectedLiability.redemption_id}`;
              return (
                <div className="space-y-5">
                  {/* Handoff block */}
                  {isShopify && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wide">
                        <ShoppingBag className="h-4 w-4 text-primary" />
                        Fulfill in Shopify
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard(customerPayload, 'Customer info')}>
                          <Copy className="h-3 w-3 mr-1" /> Copy Customer Info
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => copyToClipboard(orderPayload, 'Order details')}>
                          <Copy className="h-3 w-3 mr-1" /> Copy Order Details
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Request shipping address from the customer before creating the Shopify order.
                      </p>
                    </div>
                  )}

                  {isManual && (
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-sm uppercase tracking-wide">
                        <Factory className="h-4 w-4 text-primary" />
                        Manual Order
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Place this order directly with the supplier; no Shopify integration.
                      </p>
                    </div>
                  )}

                  {/* Shopify fields */}
                  {isShopify && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Shopify Order ID</Label>
                        <Input value={shopifyOrderId} onChange={(e) => setShopifyOrderId(e.target.value)} placeholder="#1234" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Shopify Order URL</Label>
                        <div className="flex gap-1">
                          <Input value={shopifyOrderUrl} onChange={(e) => setShopifyOrderUrl(e.target.value)} placeholder="https://admin.shopify.com/..." />
                          {shopifyOrderUrl && (
                            <Button size="icon" variant="ghost" asChild>
                              <a href={shopifyOrderUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                            </Button>
                          )}
                        </div>
                      </div>
                      {cat === 'store_credit' && (
                        <div className="space-y-1.5 md:col-span-2">
                          <Label className="text-xs">Shopify Gift Card ID</Label>
                          <Input value={shopifyGiftCardId} onChange={(e) => setShopifyGiftCardId(e.target.value)} placeholder="gid://shopify/GiftCard/..." />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Manual order fields */}
                  {isManual && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Supplier</Label>
                        <Select value={supplier} onValueChange={setSupplier}>
                          <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Goode">Goode</SelectItem>
                            <SelectItem value="Radar">Radar</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Order Reference (PO#)</Label>
                        <Input value={orderReference} onChange={(e) => setOrderReference(e.target.value)} placeholder="PO-2026-001" />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <Label className="text-xs">Estimated Arrival</Label>
                        <Input type="date" value={estimatedArrival} onChange={(e) => setEstimatedArrival(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {/* Tracking — always shown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t">
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1"><Truck className="h-3 w-3" /> Tracking Number</Label>
                      <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="1Z..." />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Carrier</Label>
                      <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="UPS / FedEx / USPS" />
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" /> Notes</Label>
                    <Textarea
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Internal fulfillment notes"
                      rows={3}
                    />
                  </div>

                  {/* Customer-provided shipping */}
                  {r?.shipping_name && (
                    <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
                      <p className="font-semibold uppercase tracking-wide text-muted-foreground">Customer ship-to</p>
                      <p>{r.shipping_name}</p>
                      <p>{r.shipping_address_line1}{r.shipping_address_line2 ? `, ${r.shipping_address_line2}` : ''}</p>
                      <p>{r.shipping_city}, {r.shipping_state} {r.shipping_zip}</p>
                      <p>📞 {r.shipping_phone}</p>
                      {r.glove_size && <p>Glove size: <strong>{r.glove_size}</strong></p>}
                    </div>
                  )}
                  {r?.gift_card_email && (
                    <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                      <p className="font-semibold uppercase tracking-wide text-muted-foreground mb-1">Gift card recipient email</p>
                      <p>{r.gift_card_email}</p>
                    </div>
                  )}

                  {/* Gift card code (only for fulfillment of store_credit) */}
                  {cat === 'store_credit' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs">Gift Card Code (sent to user on Mark Fulfilled)</Label>
                      <Input value={giftCardCode} onChange={(e) => setGiftCardCode(e.target.value)} placeholder="GIFT-XXXX-XXXX" />
                    </div>
                  )}
                </div>
              );
            })()}
            <DialogFooter>
              <div className="flex flex-wrap gap-2 w-full justify-end">
                <Button variant="outline" onClick={() => setFulfillDialogOpen(false)}>Close</Button>
                <Button
                  variant="secondary"
                  onClick={() => selectedLiability && saveFulfillmentMutation.mutate({ liability: selectedLiability })}
                  disabled={saveFulfillmentMutation.isPending}
                >
                  Save
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (!selectedLiability) return;
                    const reason = window.prompt('Cancellation reason (sent to user):');
                    if (!reason || !reason.trim()) return;
                    refundMutation.mutate({ liability: selectedLiability, reason: reason.trim() });
                  }}
                  disabled={refundMutation.isPending}
                >
                  <X className="h-4 w-4 mr-1" /> Cancel & Refund
                </Button>
                <Button
                  onClick={() => {
                    if (!selectedLiability) return;
                    if (!trackingNumber || !carrier) {
                      toast({ title: 'Tracking required', description: 'Enter tracking # and carrier first.', variant: 'destructive' });
                      return;
                    }
                    transitionMutation.mutate({ liability: selectedLiability, toStatus: 'shipped' });
                  }}
                  disabled={transitionMutation.isPending}
                >
                  <Truck className="h-4 w-4 mr-1" /> Mark Shipped
                </Button>
                <Button
                  onClick={() => selectedLiability && transitionMutation.mutate({ liability: selectedLiability, toStatus: 'fulfilled' })}
                  disabled={transitionMutation.isPending}
                >
                  <Check className="h-4 w-4 mr-1" /> Mark Fulfilled
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { VaultLayout } from '@/components/vault/VaultLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usd } from '@/lib/vault';
import { VaultImage } from '@/components/vault/VaultImage';

const emptyLot = {
  sku: '',
  title: '',
  brand: '',
  model: '',
  size_cm: '',
  year: '',
  condition: 'ridden',
  description: '',
  listing_type: 'auction',
  start_price: '',
  reserve_price: '',
  buy_now_price: '',
  retail_price: '',
  closes_at: '',
  sort_order: '0',
  consignor_id: '',
  specs_confirmed: false,
};

const VaultAdmin = () => {
  const { isAdmin, isLoading } = useAdminCheck();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dropId, setDropId] = useState<string>('');
  const [lot, setLot] = useState({ ...emptyLot });
  const [files, setFiles] = useState<FileList | null>(null);
  const [saving, setSaving] = useState(false);
  const [newDrop, setNewDrop] = useState({ name: '', drop_number: '', opens_at: '', closes_at: '', description: '' });
  const [skuSearch, setSkuSearch] = useState('');

  const { data: nextSku } = useQuery({
    queryKey: ['vault-next-sku'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vault_next_sku');
      if (error) throw error;
      return (data as unknown as string) ?? '';
    },
    enabled: !!isAdmin,
  });

  const { data: consignors = [] } = useQuery({
    queryKey: ['vault-consignors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vault_consignors').select('id, display_name').order('display_name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: drops = [] } = useQuery({
    queryKey: ['vault-admin-drops'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vault_drops').select('*').order('drop_number', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: skis = [] } = useQuery({
    queryKey: ['vault-admin-skis', dropId],
    queryFn: async () => {
      // vault_skis is not readable from the client (reserve_price is hidden);
      // admins read the full rows through this admin-gated function instead.
      const { data, error } = await supabase.rpc('vault_admin_skis', { p_drop_id: dropId || null });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['vault-admin-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_orders')
        .select('*, vault_public_skis(title)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  if (isLoading || !isAdmin) {
    return (
      <VaultLayout title="Vault Admin" description="Vault administration.">
        <Skeleton className="h-64 w-full" />
      </VaultLayout>
    );
  }

  const num = (v: string) => (v === '' ? null : Number(v));

  const createDrop = async () => {
    const { error } = await supabase.from('vault_drops').insert({
      name: newDrop.name,
      drop_number: Number(newDrop.drop_number || 1),
      opens_at: new Date(newDrop.opens_at).toISOString(),
      closes_at: new Date(newDrop.closes_at).toISOString(),
      description: newDrop.description || null,
    });
    if (error) return toast({ title: 'Could not create drop', description: error.message, variant: 'destructive' });
    setNewDrop({ name: '', drop_number: '', opens_at: '', closes_at: '', description: '' });
    qc.invalidateQueries({ queryKey: ['vault-admin-drops'] });
    toast({ title: 'Drop created' });
  };

  const setDropStatus = async (id: string, status: 'scheduled' | 'live' | 'closed') => {
    await supabase.from('vault_drops').update({ status }).eq('id', id);
    if (status === 'live') {
      await supabase.from('vault_skis').update({ status: 'live' }).eq('drop_id', id).eq('status', 'scheduled');
    }
    qc.invalidateQueries({ queryKey: ['vault-admin-drops'] });
    qc.invalidateQueries({ queryKey: ['vault-admin-skis'] });
  };

  const uploadPhotos = async (): Promise<string[]> => {
    if (!files?.length) return [];
    const paths: string[] = [];
    for (const file of Array.from(files)) {
      const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
      const { error } = await supabase.storage.from('vault-photos').upload(path, file);
      if (error) throw error;
      paths.push(path);
    }
    return paths;
  };

  const createLot = async () => {
    setSaving(true);
    try {
      if (!lot.sku.trim()) {
        throw new Error('SKU is required');
      }
      const image_urls = await uploadPhotos();
      const start = Number(lot.start_price || 0);
      const { error } = await supabase.from('vault_skis').insert({
        drop_id: dropId || null,
        sku: lot.sku.trim(),
        specs_confirmed: lot.specs_confirmed,
        consignor_id: lot.consignor_id || null,
        title: lot.title,
        brand: lot.brand,
        model: lot.model,
        size_cm: lot.size_cm || null,
        year: lot.year || null,
        condition: lot.condition as 'brand_new' | 'barely_ridden' | 'ridden',
        description: lot.description || null,
        image_urls,
        listing_type: lot.listing_type as 'auction' | 'buy_now',
        start_price: start,
        current_price: start,
        reserve_price: num(lot.reserve_price),
        buy_now_price: num(lot.buy_now_price),
        retail_price: num(lot.retail_price),
        closes_at: lot.closes_at ? new Date(lot.closes_at).toISOString() : null,
        sort_order: Number(lot.sort_order || 0),
      });
      if (error) throw error;
      setLot({ ...emptyLot });
      setFiles(null);
      qc.invalidateQueries({ queryKey: ['vault-admin-skis'] });
      qc.invalidateQueries({ queryKey: ['vault-next-sku'] });
      toast({ title: 'Lot created' });
    } catch (e) {
      const msg = (e as Error).message;
      toast({
        title: 'Could not create lot',
        description: /vault_skis_sku_key|duplicate key/i.test(msg) ? 'That SKU is already used by another lot.' : msg,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const closeDue = async () => {
    const { data, error } = await supabase.functions.invoke('vault-close-auctions', { body: {} });
    if (error) return toast({ title: 'Close failed', description: error.message, variant: 'destructive' });
    qc.invalidateQueries({ queryKey: ['vault-admin-skis'] });
    qc.invalidateQueries({ queryKey: ['vault-admin-orders'] });
    toast({ title: 'Closer run', description: JSON.stringify(data) });
  };

  const f = (k: keyof typeof lot) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setLot((s) => ({ ...s, [k]: e.target.value }));

  const filteredSkis = (skis as Record<string, unknown>[]).filter((s) => {
    const q = skuSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(s.sku ?? '').toLowerCase().includes(q) ||
      String(s.title ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <VaultLayout title="Vault Admin" description="Manage Vault drops, lots and orders.">
      <h1 className="vault-serif mb-4 text-3xl uppercase tracking-[0.14em]">Vault Admin</h1>

      <Tabs defaultValue="lots">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="drops">Drops</TabsTrigger>
          <TabsTrigger value="lots">Lots</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="drops" className="mt-4 space-y-4">
          <div className="grid gap-2 border border-border p-4 sm:grid-cols-2">
            <div><Label>Name</Label><Input value={newDrop.name} onChange={(e) => setNewDrop({ ...newDrop, name: e.target.value })} /></div>
            <div><Label>Drop number</Label><Input value={newDrop.drop_number} onChange={(e) => setNewDrop({ ...newDrop, drop_number: e.target.value })} /></div>
            <div><Label>Opens</Label><Input type="datetime-local" value={newDrop.opens_at} onChange={(e) => setNewDrop({ ...newDrop, opens_at: e.target.value })} /></div>
            <div><Label>Closes</Label><Input type="datetime-local" value={newDrop.closes_at} onChange={(e) => setNewDrop({ ...newDrop, closes_at: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Description</Label><Textarea value={newDrop.description} onChange={(e) => setNewDrop({ ...newDrop, description: e.target.value })} /></div>
            <Button className="sm:col-span-2" onClick={createDrop}>Create drop</Button>
          </div>

          {drops.map((d) => (
            <div key={d.id} className="flex items-center justify-between border border-border p-3">
              <div>
                <p className="vault-serif text-lg">#{d.drop_number} {d.name}</p>
                <p className="vault-kicker text-[9px] text-muted-foreground">{d.status}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={dropId === d.id ? 'default' : 'outline'} onClick={() => setDropId(d.id)}>Select</Button>
                <Button size="sm" variant="outline" onClick={() => setDropStatus(d.id, 'live')}>Go live</Button>
                <Button size="sm" variant="outline" onClick={() => setDropStatus(d.id, 'closed')}>Close</Button>
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="lots" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="vault-kicker text-[10px] text-muted-foreground">
              Drop: {drops.find((d) => d.id === dropId)?.name ?? 'none selected'}
            </p>
            <Button size="sm" variant="outline" onClick={closeDue}>Run auction closer</Button>
          </div>

          <div className="grid gap-2 border border-border p-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Title</Label><Input value={lot.title} onChange={f('title')} /></div>
            <div><Label>Brand</Label><Input value={lot.brand} onChange={f('brand')} /></div>
            <div><Label>Model</Label><Input value={lot.model} onChange={f('model')} /></div>
            <div><Label>Size (cm)</Label><Input value={lot.size_cm} onChange={f('size_cm')} /></div>
            <div><Label>Year</Label><Input value={lot.year} onChange={f('year')} /></div>
            <div>
              <Label>Condition</Label>
              <select
                className="h-10 w-full border border-border bg-input px-2 text-sm"
                value={lot.condition}
                onChange={(e) => setLot({ ...lot, condition: e.target.value })}
              >
                <option value="brand_new">Brand New</option>
                <option value="barely_ridden">Barely Ridden</option>
                <option value="ridden">Ridden</option>
              </select>
            </div>
            <div>
              <Label>Listing type</Label>
              <select
                className="h-10 w-full border border-border bg-input px-2 text-sm"
                value={lot.listing_type}
                onChange={(e) => setLot({ ...lot, listing_type: e.target.value })}
              >
                <option value="auction">Auction</option>
                <option value="buy_now">Buy Now</option>
              </select>
            </div>
            <div><Label>Start price</Label><Input value={lot.start_price} onChange={f('start_price')} /></div>
            <div><Label>Reserve (hidden)</Label><Input value={lot.reserve_price} onChange={f('reserve_price')} /></div>
            <div><Label>Buy now price</Label><Input value={lot.buy_now_price} onChange={f('buy_now_price')} /></div>
            <div><Label>Retail price</Label><Input value={lot.retail_price} onChange={f('retail_price')} /></div>
            <div><Label>Closes at</Label><Input type="datetime-local" value={lot.closes_at} onChange={f('closes_at')} /></div>
            <div><Label>Sort order</Label><Input value={lot.sort_order} onChange={f('sort_order')} /></div>
            <div className="sm:col-span-2"><Label>Description</Label><Textarea value={lot.description} onChange={f('description')} /></div>
            <div className="sm:col-span-2">
              <Label>Photos</Label>
              <Input type="file" multiple accept="image/*" onChange={(e) => setFiles(e.target.files)} />
            </div>
            <Button className="sm:col-span-2" onClick={createLot} disabled={saving}>
              {saving ? 'Saving…' : 'Create lot'}
            </Button>
          </div>

          {skis.map((s) => (
            <div key={s.id} className="flex items-center gap-3 border border-border p-3">
              <VaultImage path={s.image_urls?.[0]} alt="" className="h-14 w-14" />
              <div className="flex-1">
                <p className="vault-serif text-lg">{s.title}</p>
                <p className="vault-kicker text-[9px] text-muted-foreground">
                  {s.status} · {s.bid_count} bids · {usd(Number(s.current_price))} · reserve {usd(Number(s.reserve_price))}
                </p>
              </div>
              <select
                className="h-9 border border-border bg-input px-2 text-xs"
                value={s.status}
                onChange={async (e) => {
                  await supabase.from('vault_skis').update({ status: e.target.value as 'live' }).eq('id', s.id);
                  qc.invalidateQueries({ queryKey: ['vault-admin-skis'] });
                }}
              >
                <option value="scheduled">scheduled</option>
                <option value="live">live</option>
                <option value="ended_met">ended_met</option>
                <option value="ended_no_reserve_met">ended_no_reserve_met</option>
                <option value="sold">sold</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-2">
          {orders.map((o) => (
            <div key={o.id} className="border border-border p-3">
              <div className="flex justify-between">
                <p className="vault-serif text-lg">
                  {(o as { vault_public_skis?: { title?: string } }).vault_public_skis?.title ?? 'Lot'}
                </p>
                <span className="vault-kicker text-[10px] text-primary">{o.status}</span>
              </div>
              <p className="font-mono text-sm">{usd(Number(o.total))}</p>
              <div className="mt-2 flex gap-2">
                <Input
                  placeholder="Tracking number"
                  defaultValue={o.tracking_number ?? ''}
                  onBlur={async (e) => {
                    if (!e.target.value || e.target.value === o.tracking_number) return;
                    const { error } = await supabase.functions.invoke('vault-ship-order', {
                      body: { order_id: o.id, tracking_number: e.target.value },
                    });
                    if (error) {
                      toast({ title: 'Could not mark shipped', description: error.message, variant: 'destructive' });
                      return;
                    }
                    toast({ title: 'Marked shipped', description: 'Tracking emailed to the buyer.' });
                    qc.invalidateQueries({ queryKey: ['vault-admin-orders'] });
                  }}
                />
                {(o.status === 'paid' || o.status === 'shipped') && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!confirm(`Refund ${usd(Number(o.total))} and relist this lot?`)) return;
                      const { data, error } = await supabase.functions.invoke('vault-refund-order', {
                        body: { order_id: o.id, relist: true },
                      });
                      const err = error?.message ?? (data as { error?: string })?.error;
                      if (err) {
                        toast({ title: 'Refund failed', description: err, variant: 'destructive' });
                        return;
                      }
                      toast({ title: 'Refunded', description: 'Order refunded and lot relisted.' });
                      qc.invalidateQueries({ queryKey: ['vault-admin-orders'] });
                      qc.invalidateQueries({ queryKey: ['vault-admin-skis'] });
                    }}
                  >
                    Refund
                  </Button>
                )}
              </div>
              {o.last_error && <p className="mt-1 text-xs text-destructive">{o.last_error}</p>}
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </VaultLayout>
  );
};

export default VaultAdmin;
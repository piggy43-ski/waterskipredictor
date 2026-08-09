import { useMemo, useState } from 'react';
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

type Consignor = {
  id: string;
  display_name: string;
  slug: string | null;
  bio: string | null;
  real_name: string | null;
  email: string | null;
  phone: string | null;
  is_anonymous: boolean;
  commission_rate: number;
  payout_method: string | null;
  payout_details: string | null;
  notes: string | null;
};

const emptyConsignor = {
  display_name: '',
  slug: '',
  bio: '',
  real_name: '',
  email: '',
  phone: '',
  is_anonymous: true,
  commission_rate: '0.25',
  payout_method: '',
  payout_details: '',
  notes: '',
};

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

const download = (name: string, text: string) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const VaultConsignors = () => {
  const { isAdmin, isLoading } = useAdminCheck();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...emptyConsignor });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [payout, setPayout] = useState({ amount: '', method: '', reference: '' });

  const { data: bids = [] } = useQuery({
    queryKey: ['vault-referred-bids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_bids')
        .select('id, user_id, source, ski_id')
        .not('source', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: referredOrders = [] } = useQuery({
    queryKey: ['vault-referred-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_orders')
        .select('id, user_id, hammer_price, status')
        .in('status', ['paid', 'shipped']);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: bidderProfiles = [] } = useQuery({
    queryKey: ['vault-bidder-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_bidder_profiles')
        .select('user_id, source')
        .not('source', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: consignors = [] } = useQuery({
    queryKey: ['vault-consignors-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vault_consignors').select('*').order('display_name');
      if (error) throw error;
      return (data ?? []) as Consignor[];
    },
    enabled: !!isAdmin,
  });

  const { data: skis = [] } = useQuery({
    queryKey: ['vault-consignor-skis'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_skis')
        .select('id, sku, title, status, current_price, consignor_id, image_urls, provenance')
        .not('consignor_id', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['vault-consignor-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_orders')
        .select('id, ski_id, status, hammer_price, commission_rate, house_cut, consignor_payout, consignor_id, created_at')
        .not('consignor_id', 'is', null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: payouts = [] } = useQuery({
    queryKey: ['vault-consignor-payouts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_consignor_payouts')
        .select('*')
        .order('paid_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['vault-submissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_consignment_submissions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!isAdmin,
  });

  const owedFor = useMemo(
    () => (id: string) => {
      const earned = orders
        .filter((o) => o.consignor_id === id && (o.status === 'paid' || o.status === 'shipped'))
        .reduce((s, o) => s + Number(o.consignor_payout ?? 0), 0);
      const paid = payouts.filter((p) => p.consignor_id === id).reduce((s, p) => s + Number(p.amount ?? 0), 0);
      return { earned, paid, owed: earned - paid };
    },
    [orders, payouts]
  );

  const refStatsFor = useMemo(
    () => (slug: string | null) => {
      if (!slug) return { bids: 0, bidders: 0, hammer: 0 };
      const refBids = bids.filter((b) => b.source === slug);
      const referredUsers = new Set<string>([
        ...refBids.map((b) => b.user_id),
        ...bidderProfiles.filter((p) => p.source === slug).map((p) => p.user_id),
      ]);
      const hammer = referredOrders
        .filter((o) => referredUsers.has(o.user_id))
        .reduce((s, o) => s + Number(o.hammer_price ?? 0), 0);
      return { bids: refBids.length, bidders: referredUsers.size, hammer };
    },
    [bids, bidderProfiles, referredOrders]
  );

  if (isLoading || !isAdmin) {
    return (
      <VaultLayout title="Vault Consignors" description="Vault consignor administration.">
        <Skeleton className="h-64 w-full" />
      </VaultLayout>
    );
  }

  const saveConsignor = async () => {
    if (!form.display_name.trim()) {
      return toast({ title: 'Display name is required', variant: 'destructive' });
    }
    const payload = {
      display_name: form.display_name.trim(),
      slug: form.slug.trim() || form.display_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      bio: form.bio || null,
      real_name: form.real_name || null,
      email: form.email || null,
      phone: form.phone || null,
      is_anonymous: form.is_anonymous,
      commission_rate: Number(form.commission_rate || 0.25),
      payout_method: form.payout_method || null,
      payout_details: form.payout_details || null,
      notes: form.notes || null,
    };
    const { error } = editingId
      ? await supabase.from('vault_consignors').update(payload).eq('id', editingId)
      : await supabase.from('vault_consignors').insert(payload);
    if (error) return toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    setForm({ ...emptyConsignor });
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ['vault-consignors-admin'] });
    toast({ title: editingId ? 'Consignor updated' : 'Consignor added' });
  };

  const recordPayout = async (id: string) => {
    const amount = Number(payout.amount || 0);
    if (!amount) return toast({ title: 'Enter an amount', variant: 'destructive' });
    const { error } = await supabase.from('vault_consignor_payouts').insert({
      consignor_id: id,
      amount,
      method: payout.method || null,
      reference: payout.reference || null,
    });
    if (error) return toast({ title: 'Could not record payout', description: error.message, variant: 'destructive' });
    setPayout({ amount: '', method: '', reference: '' });
    qc.invalidateQueries({ queryKey: ['vault-consignor-payouts'] });
    toast({ title: 'Payout recorded' });
  };

  const acceptSubmission = async (s: Record<string, any>) => {
    const { data: c, error: cErr } = await supabase
      .from('vault_consignors')
      .insert({
        display_name: s.contact_name,
        real_name: s.contact_name,
        email: s.contact_email,
        phone: s.contact_phone,
        is_anonymous: true,
      })
      .select('id, commission_rate')
      .single();
    if (cErr) return toast({ title: 'Could not create consignor', description: cErr.message, variant: 'destructive' });

    const { error: sErr } = await supabase.from('vault_skis').insert({
      consignor_id: c.id,
      title: `${s.brand} ${s.model}`.trim(),
      brand: s.brand,
      model: s.model,
      size_cm: s.size_cm,
      year: s.year,
      condition: s.condition,
      description: s.notes,
      image_urls: s.image_urls ?? [],
      listing_type: 'auction',
      start_price: 0,
      current_price: 0,
      status: 'scheduled',
      specs_confirmed: false,
    });
    if (sErr) return toast({ title: 'Could not create draft lot', description: sErr.message, variant: 'destructive' });

    await supabase
      .from('vault_consignment_submissions')
      .update({ status: 'accepted', consignor_id: c.id })
      .eq('id', s.id);

    qc.invalidateQueries({ queryKey: ['vault-submissions'] });
    qc.invalidateQueries({ queryKey: ['vault-consignors-admin'] });
    qc.invalidateQueries({ queryKey: ['vault-consignor-skis'] });
    toast({ title: 'Accepted', description: 'Consignor and draft lot created.' });
  };

  const statementRows = (id: string) => {
    const lots = skis.filter((s) => s.consignor_id === id);
    return lots.map((s) => {
      const o = orders.find((o) => o.ski_id === s.id);
      return {
        sku: s.sku ?? '—',
        title: s.title,
        status: o ? o.status : s.status,
        hammer: o ? Number(o.hammer_price ?? 0) : 0,
        rate: o ? Number(o.commission_rate ?? 0) : null,
        house: o ? Number(o.house_cut ?? 0) : 0,
        payout: o ? Number(o.consignor_payout ?? 0) : 0,
      };
    });
  };

  const exportStatement = (c: Consignor) => {
    const rows: (string | number)[][] = [
      ['SKU', 'Lot', 'Status', 'Hammer', 'Commission rate', 'House cut', 'Your payout'],
      ...statementRows(c.id).map((r) => [r.sku, r.title, r.status, r.hammer, r.rate ?? '', r.house, r.payout]),
    ];
    const { earned, paid, owed } = owedFor(c.id);
    rows.push([], ['Earned', earned], ['Paid out', paid], ['Owed', owed]);
    download(`vault-statement-${c.display_name.replace(/\W+/g, '-').toLowerCase()}.csv`, csv(rows));
  };

  const current = consignors.find((c) => c.id === selected) ?? null;

  return (
    <VaultLayout title="Vault Consignors" description="Manage Vault consignors, statements and payouts.">
      <h1 className="vault-serif mb-4 text-3xl uppercase tracking-[0.14em]">Consignors</h1>

      <Tabs defaultValue="consignors">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="consignors">Consignors</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
          <TabsTrigger value="submissions">Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="consignors" className="mt-4 space-y-4">
          <div className="grid gap-2 border border-border p-4 sm:grid-cols-2">
            <div><Label>Public display name</Label><Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
            <div>
              <Label>Share link slug</Label>
              <Input placeholder="auto from display name" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Public bio (shown on their share page)</Label>
              <Textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
            <div><Label>Real name (private)</Label><Input value={form.real_name} onChange={(e) => setForm({ ...form, real_name: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div><Label>Commission rate (0.25 = 25%)</Label><Input value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} /></div>
            <div><Label>Payout method</Label><Input value={form.payout_method} onChange={(e) => setForm({ ...form, payout_method: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <Label>Payout reference (no full account numbers)</Label>
              <Input value={form.payout_details} onChange={(e) => setForm({ ...form, payout_details: e.target.value })} />
            </div>
            <div className="sm:col-span-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <label className="sm:col-span-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_anonymous} onChange={(e) => setForm({ ...form, is_anonymous: e.target.checked })} />
              Keep anonymous publicly
            </label>
            <Button className="sm:col-span-2" onClick={saveConsignor}>
              {editingId ? 'Save changes' : 'Add consignor'}
            </Button>
          </div>

          {consignors.map((c) => {
            const { earned, paid, owed } = owedFor(c.id);
            const lots = skis.filter((s) => s.consignor_id === c.id);
            const sold = lots.filter((s) => orders.some((o) => o.ski_id === s.id)).length;
            return (
              <div key={c.id} className="border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="vault-serif text-lg">{c.display_name}</p>
                    <p className="vault-kicker text-[9px] text-muted-foreground">
                      {Math.round(Number(c.commission_rate) * 100)}% commission · {lots.length} lots · {sold} sold ·{' '}
                      {c.is_anonymous ? 'anonymous' : 'named publicly'}
                    </p>
                    <p className="mt-1 font-mono text-sm">
                      Earned {usd(earned)} · Paid {usd(paid)} ·{' '}
                      <span className={owed > 0 ? 'text-primary' : ''}>Owed {usd(owed)}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setSelected(c.id); }}>
                      Statement
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingId(c.id);
                        setForm({
                          display_name: c.display_name,
                          slug: c.slug ?? '',
                          bio: c.bio ?? '',
                          real_name: c.real_name ?? '',
                          email: c.email ?? '',
                          phone: c.phone ?? '',
                          is_anonymous: c.is_anonymous,
                          commission_rate: String(c.commission_rate),
                          payout_method: c.payout_method ?? '',
                          payout_details: c.payout_details ?? '',
                          notes: c.notes ?? '',
                        });
                      }}
                    >
                      Edit
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div><Label className="text-[10px]">Amount</Label><Input className="h-9 w-28" value={payout.amount} onChange={(e) => setPayout({ ...payout, amount: e.target.value })} /></div>
                  <div><Label className="text-[10px]">Method</Label><Input className="h-9 w-32" value={payout.method} onChange={(e) => setPayout({ ...payout, method: e.target.value })} /></div>
                  <div><Label className="text-[10px]">Reference</Label><Input className="h-9 w-40" value={payout.reference} onChange={(e) => setPayout({ ...payout, reference: e.target.value })} /></div>
                  <Button size="sm" onClick={() => recordPayout(c.id)}>Mark payout sent</Button>
                </div>

                {payouts.filter((p) => p.consignor_id === c.id).length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {payouts
                      .filter((p) => p.consignor_id === c.id)
                      .map((p) => (
                        <li key={p.id} className="font-mono">
                          {new Date(p.paid_at).toLocaleDateString()} · {usd(Number(p.amount))} · {p.method ?? '—'} ·{' '}
                          {p.reference ?? '—'}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="statement" className="mt-4 space-y-3">
          <select
            className="h-10 w-full border border-border bg-input px-2 text-sm"
            value={selected ?? ''}
            onChange={(e) => setSelected(e.target.value || null)}
          >
            <option value="">Select a consignor…</option>
            {consignors.map((c) => (
              <option key={c.id} value={c.id}>{c.display_name}</option>
            ))}
          </select>

          {current && (
            <div className="border border-border p-4 print:border-0">
              <div className="flex items-center justify-between">
                <div>
                  <p className="vault-serif text-xl">{current.display_name}</p>
                  <p className="vault-kicker text-[9px] text-muted-foreground">
                    The Vault — by Waterski Predictor · statement
                  </p>
                </div>
                <div className="flex gap-2 print:hidden">
                  <Button size="sm" variant="outline" onClick={() => exportStatement(current)}>Export CSV</Button>
                  <Button size="sm" variant="outline" onClick={() => window.print()}>Print</Button>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left vault-kicker text-[9px] text-muted-foreground">
                      <th className="py-2">SKU</th><th>Lot</th><th>Status</th>
                      <th className="text-right">Hammer</th><th className="text-right">Rate</th>
                      <th className="text-right">House cut</th><th className="text-right">Payout</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementRows(current.id).map((r) => (
                      <tr key={r.sku + r.title} className="border-b border-border/60">
                        <td className="py-2 font-mono text-xs">{r.sku}</td>
                        <td>{r.title}</td>
                        <td className="text-xs text-muted-foreground">{r.status}</td>
                        <td className="text-right font-mono">{r.hammer ? usd(r.hammer) : '—'}</td>
                        <td className="text-right font-mono">{r.rate !== null ? `${Math.round(r.rate * 100)}%` : '—'}</td>
                        <td className="text-right font-mono">{r.hammer ? usd(r.house) : '—'}</td>
                        <td className="text-right font-mono">{r.hammer ? usd(r.payout) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-4 font-mono text-sm">
                Earned {usd(owedFor(current.id).earned)} · Paid {usd(owedFor(current.id).paid)} ·{' '}
                <span className="text-primary">Owed {usd(owedFor(current.id).owed)}</span>
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Commission is taken from the hammer price only. Shipping is paid by the buyer and is never
                commissionable.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="submissions" className="mt-4 space-y-2">
          {submissions.map((s: Record<string, any>) => (
            <div key={s.id} className="border border-border p-3">
              <div className="flex justify-between">
                <p className="vault-serif text-lg">{s.brand} {s.model}</p>
                <span className="vault-kicker text-[10px] text-primary">{s.status}</span>
              </div>
              <p className="vault-kicker text-[9px] text-muted-foreground">
                {s.size_cm ?? '—'} · {s.year ?? '—'} · {s.condition} · asking {s.asking_price ? usd(Number(s.asking_price)) : '—'}
              </p>
              <p className="mt-1 text-sm">{s.notes}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {s.contact_name} · {s.contact_email} {s.contact_phone ? `· ${s.contact_phone}` : ''}
              </p>
              {s.status === 'new' && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => acceptSubmission(s)}>Accept</Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await supabase.from('vault_consignment_submissions').update({ status: 'declined' }).eq('id', s.id);
                      qc.invalidateQueries({ queryKey: ['vault-submissions'] });
                    }}
                  >
                    Decline
                  </Button>
                </div>
              )}
              {s.status === 'accepted' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={async () => {
                    await supabase.from('vault_consignment_submissions').update({ status: 'received' }).eq('id', s.id);
                    qc.invalidateQueries({ queryKey: ['vault-submissions'] });
                  }}
                >
                  Mark received
                </Button>
              )}
            </div>
          ))}
          {!submissions.length && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
        </TabsContent>
      </Tabs>
    </VaultLayout>
  );
};

export default VaultConsignors;

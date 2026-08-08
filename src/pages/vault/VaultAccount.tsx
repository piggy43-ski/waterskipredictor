import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { VaultLayout } from '@/components/vault/VaultLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { usd } from '@/lib/vault';
import { useState } from 'react';
import { VaultBidderSetup } from '@/components/vault/VaultBidderSetup';

const VaultAccount = () => {
  const { user } = useAuth();
  const [setupOpen, setSetupOpen] = useState(false);

  const { data: myBids = [] } = useQuery({
    queryKey: ['vault-my-bids', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_bids')
        .select('id, ski_id, amount, max_bid, outbid_at, created_at')
        .eq('user_id', user!.id)
        .eq('is_auto', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: lots = [] } = useQuery({
    queryKey: ['vault-my-bid-lots', myBids.map((b) => b.ski_id).join(',')],
    queryFn: async () => {
      const ids = [...new Set(myBids.map((b) => b.ski_id))];
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from('vault_public_skis')
        .select('id, title, current_price, status, highest_bidder_id, closes_at')
        .in('id', ids);
      if (error) throw error;
      return data ?? [];
    },
    enabled: myBids.length > 0,
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['vault-my-orders', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_orders')
        .select('*, vault_skis(title)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: watch = [] } = useQuery({
    queryKey: ['vault-my-watch', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_watchlist')
        .select('id, ski_id, vault_skis(title, current_price, status)')
        .eq('user_id', user!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const lotById = new Map(lots.map((l) => [l.id, l]));

  return (
    <VaultLayout title="My Bids — The Vault" description="Track your Vault bids, orders and watchlist.">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="vault-serif text-3xl uppercase tracking-[0.14em]">My Vault</h1>
        <Button variant="outline" size="sm" onClick={() => setSetupOpen(true)}>
          Shipping details
        </Button>
      </div>

      <Tabs defaultValue="bids">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="bids">Bids</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="watch">Watching</TabsTrigger>
        </TabsList>

        <TabsContent value="bids" className="mt-4 space-y-2">
          {myBids.length ? (
            myBids.map((b) => {
              const lot = lotById.get(b.ski_id);
              const leading = lot?.highest_bidder_id === user?.id;
              return (
                <Link
                  key={b.id}
                  to={`/vault/ski/${b.ski_id}`}
                  className="flex items-center justify-between border border-border p-3 hover:border-primary/60"
                >
                  <div>
                    <p className="vault-serif text-lg">{lot?.title ?? 'Lot'}</p>
                    <p className="vault-kicker text-[9px] text-muted-foreground">
                      Your max {usd(Number(b.max_bid))}
                    </p>
                  </div>
                  <span
                    className={`vault-kicker text-[10px] ${leading ? 'text-primary' : 'text-muted-foreground'}`}
                  >
                    {lot?.status !== 'live' ? 'Closed' : leading ? 'Leading' : 'Outbid'}
                  </span>
                </Link>
              );
            })
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No bids yet.</p>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-2">
          {orders.length ? (
            orders.map((o) => (
              <div key={o.id} className="border border-border p-3">
                <div className="flex justify-between">
                  <p className="vault-serif text-lg">
                    {(o as { vault_skis?: { title?: string } }).vault_skis?.title ?? 'Lot'}
                  </p>
                  <span className="vault-kicker text-[10px] text-primary">{o.status}</span>
                </div>
                <p className="mt-1 font-mono text-sm">
                  {usd(Number(o.hammer_price))} + {usd(Number(o.shipping_cost))} shipping ={' '}
                  <strong>{usd(Number(o.total))}</strong>
                </p>
                {o.tracking_number && (
                  <p className="mt-1 text-xs text-muted-foreground">Tracking: {o.tracking_number}</p>
                )}
              </div>
            ))
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No orders yet.</p>
          )}
        </TabsContent>

        <TabsContent value="watch" className="mt-4 space-y-2">
          {watch.length ? (
            watch.map((w) => (
              <Link
                key={w.id}
                to={`/vault/ski/${w.ski_id}`}
                className="flex items-center justify-between border border-border p-3 hover:border-primary/60"
              >
                <p className="vault-serif text-lg">
                  {(w as { vault_skis?: { title?: string } }).vault_skis?.title ?? 'Lot'}
                </p>
                <span className="font-mono text-sm">
                  {usd(Number((w as { vault_skis?: { current_price?: number } }).vault_skis?.current_price))}
                </span>
              </Link>
            ))
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing on your watchlist.</p>
          )}
        </TabsContent>
      </Tabs>

      <VaultBidderSetup open={setupOpen} onOpenChange={setSetupOpen} onSaved={() => setSetupOpen(false)} />
    </VaultLayout>
  );
};

export default VaultAccount;
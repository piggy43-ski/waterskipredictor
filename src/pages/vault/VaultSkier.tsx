import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { VaultLayout } from '@/components/vault/VaultLayout';
import { LotCard, type VaultLot } from '@/components/vault/LotCard';
import { useVaultClock } from '@/hooks/useVaultClock';
import { Skeleton } from '@/components/ui/skeleton';

const VaultSkier = () => {
  const { slug } = useParams<{ slug: string }>();
  const { now } = useVaultClock();

  const { data: skier, isLoading } = useQuery({
    queryKey: ['vault-skier', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_public_consignors')
        .select('slug, display_name, bio, is_anonymous')
        .eq('slug', slug!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: lots = [] } = useQuery({
    queryKey: ['vault-skier-lots', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_public_skis')
        .select('*')
        .eq('consignor_slug', slug!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VaultLot[];
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <VaultLayout title="The Vault" description="Lots in The Vault.">
        <Skeleton className="h-64 w-full" />
      </VaultLayout>
    );
  }

  if (!skier) {
    return (
      <VaultLayout title="Skier not found — The Vault" description="This Vault page is not available.">
        <div className="py-20 text-center">
          <p className="vault-serif text-3xl uppercase tracking-[0.15em]">Nothing here</p>
          <Link to="/vault" className="mt-4 inline-block vault-kicker text-[10px] text-primary">
            Back to the drop
          </Link>
        </div>
      </VaultLayout>
    );
  }

  const stories = lots.filter((l) => l.provenance);

  return (
    <VaultLayout
      title={`${skier.display_name} — The Vault`}
      description={`Lots from ${skier.display_name}'s rack, live in The Vault by Waterski Predictor.`}
    >
      <section className="mb-10 text-center">
        <p className="vault-kicker text-[10px] text-primary">From the rack of</p>
        <h1 className="vault-serif mt-2 text-4xl uppercase tracking-[0.14em] sm:text-5xl">{skier.display_name}</h1>
        <div className="vault-rule mx-auto my-4 w-32" />
        {skier.bio ? (
          <p className="mx-auto max-w-xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {skier.bio}
          </p>
        ) : null}
      </section>

      {lots.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {lots.map((lot, i) => (
            <LotCard key={lot.id} lot={lot} now={now} index={i} />
          ))}
        </div>
      ) : (
        <div className="border border-border p-12 text-center">
          <p className="vault-serif text-2xl uppercase tracking-[0.15em]">No live lots</p>
          <p className="mt-2 text-sm text-muted-foreground">Check back when the next drop opens.</p>
        </div>
      )}

      {stories.length ? (
        <section className="mt-12 space-y-6">
          <h2 className="vault-serif text-xl uppercase tracking-[0.14em]">The stories</h2>
          <div className="vault-rule w-16" />
          {stories.map((l) => (
            <Link
              key={l.id}
              to={`/vault/ski/${l.id}`}
              className="block border-l-4 border-primary bg-card/70 px-5 py-4 transition-colors hover:bg-card"
            >
              <p className="vault-kicker text-[9px] text-muted-foreground">{l.sku ? `${l.sku} · ` : ''}{l.title}</p>
              <p className="vault-serif mt-2 whitespace-pre-line text-lg italic leading-relaxed">{l.provenance}</p>
            </Link>
          ))}
        </section>
      ) : null}
    </VaultLayout>
  );
};

export default VaultSkier;
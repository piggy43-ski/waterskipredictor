import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usd } from '@/lib/vault';
import { cn } from '@/lib/utils';

export interface ManifestLot {
  id: string | null;
  lot_number: number | null;
  revealed: boolean;
  status: string;
  title: string | null;
  image: string | null;
  final_price: number | null;
}

export interface Manifest {
  total_in_vault: number;
  released: number;
  sold: number;
  teases: { sixty_sevens: number; never_ridden: number; newest_year: string | null; no_reserve: number };
  lots: ManifestLot[];
}

export function useManifest() {
  return useQuery({
    queryKey: ['vault-manifest'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('vault_manifest');
      if (error) throw error;
      return data as unknown as Manifest;
    },
  });
}

/** Compact home-page strip: the count, the plates, and a link to the full manifest. */
export const ManifestStrip = () => {
  const { data } = useManifest();
  if (!data) return null;

  return (
    <section className="mt-14 border border-border p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="vault-serif text-xl uppercase tracking-[0.14em]">The Manifest</h2>
        <Link to="/vault/manifest" className="vault-kicker text-[10px] text-primary hover:underline">
          See every lot →
        </Link>
      </div>
      <div className="vault-rule my-3 w-16" />
      <p className="vault-serif text-2xl">
        {data.total_in_vault} skis went into the vault. {data.released} have come out.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {data.lots.filter((l) => l.lot_number).map((l) => (
          <div
            key={l.lot_number ?? Math.random()}
            className={cn(
              'flex h-14 w-14 flex-col items-center justify-center border text-center',
              l.revealed ? 'border-primary/60 bg-card' : 'border-border bg-secondary'
            )}
            title={l.revealed ? l.title ?? '' : 'Sealed'}
          >
            <span className="font-mono text-[10px] text-muted-foreground">
              {String(l.lot_number ?? 0).padStart(2, '0')}
            </span>
            {l.revealed && l.final_price ? (
              <span className="font-mono text-[10px] text-primary">{usd(Number(l.final_price))}</span>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
};
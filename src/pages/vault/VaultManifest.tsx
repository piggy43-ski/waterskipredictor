import { VaultLayout } from '@/components/vault/VaultLayout';
import { VaultImage } from '@/components/vault/VaultImage';
import { useManifest } from '@/components/vault/ManifestStrip';
import { usd } from '@/lib/vault';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';

const VaultManifest = () => {
  const { data, isLoading } = useManifest();

  return (
    <VaultLayout
      title="The Vault Manifest — Every Lot, Every Hammer Price"
      description="22 skis went into the vault. See every released lot, its final hammer price, and how many remain sealed."
    >
      <section className="text-center">
        <p className="vault-kicker text-[10px] text-primary">The Manifest</p>
        <h1 className="vault-serif mt-2 text-4xl uppercase tracking-[0.12em] sm:text-5xl">
          {data ? `${data.total_in_vault} skis went in. ${data.released} have come out.` : 'The Manifest'}
        </h1>
        <div className="vault-rule mx-auto my-4 w-24" />
      </section>

      {isLoading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Still sealed', String(data.total_in_vault - data.released)],
              ['67s inside', String(data.teases.sixty_sevens)],
              ['Never ridden', String(data.teases.never_ridden)],
              ['No reserve', String(data.teases.no_reserve)],
            ].map(([label, value]) => (
              <div key={label} className="border border-border p-4 text-center">
                <p className="font-mono text-3xl tabular-nums">{value}</p>
                <p className="vault-kicker mt-1 text-[9px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </section>
          {data.teases.newest_year ? (
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Newest model year still inside the vault: {data.teases.newest_year}
            </p>
          ) : null}

          <section className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.lots.filter((l) => l.lot_number).map((l) => {
              const key = l.lot_number ?? l.id ?? Math.random();
              if (!l.revealed) {
                return (
                  <div
                    key={key}
                    className="flex aspect-[4/5] flex-col items-center justify-center border border-border bg-secondary"
                  >
                    <span className="vault-serif text-3xl text-muted-foreground">
                      {String(l.lot_number ?? 0).padStart(2, '0')}
                    </span>
                    <span className="vault-kicker mt-2 text-[9px] text-muted-foreground">Sealed</span>
                  </div>
                );
              }
              return (
                <Link
                  key={key}
                  to={l.id ? `/vault/ski/${l.id}` : '/vault'}
                  className="group block border border-border bg-card"
                >
                  <div className="aspect-[4/5] overflow-hidden">
                    <VaultImage path={l.image} alt={l.title ?? ''} className="h-full w-full" />
                  </div>
                  <div className="p-3">
                    <p className="font-mono text-[10px] text-muted-foreground">
                      Lot {String(l.lot_number ?? 0).padStart(2, '0')}
                    </p>
                    <p className="vault-serif text-sm leading-tight">{l.title}</p>
                    <p className="mt-1 font-mono text-sm tabular-nums text-primary">
                      {l.final_price ? `Hammered at ${usd(Number(l.final_price))}` : 'Live now'}
                    </p>
                  </div>
                </Link>
              );
            })}
          </section>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Nothing about a sealed lot is published until its Wednesday teaser — not the brand, model, year, size,
            photo or price.
          </p>
        </>
      )}
    </VaultLayout>
  );
};

export default VaultManifest;
import { VaultImage } from './VaultImage';
import { BigCountdown } from './BigCountdown';
import { AlertMe } from './AlertMe';
import { GuessGame } from './GuessGame';
import { MilestoneLadder, useMilestones } from './MilestoneLadder';
import { CONDITION_LABEL, lotLabel, usd } from '@/lib/vault';
import type { VaultLot } from './LotCard';

/** STATE 1 — before the open. The ski is visible, bidding is not. */
export const LotBefore = ({ lot, now }: { lot: VaultLot; now: number }) => {
  const price = Number(lot.start_price ?? 0);
  const { data: milestones = [] } = useMilestones(lot.id, price);
  const comp = lot.market_price ? Number(lot.market_price) : null;
  const closes = lot.closes_at ?? lot.drop_closes_at ?? null;

  return (
    <section>
      <div className="text-center">
        <p className="vault-kicker text-[10px] text-primary">{lotLabel(lot.lot_number)} — not open yet</p>
        <h1 className="vault-serif mt-2 text-4xl uppercase leading-none tracking-[0.1em] sm:text-5xl">
          {lot.title}
        </h1>
        <p className="vault-kicker mt-2 text-[9px] text-muted-foreground">
          {lot.condition ? CONDITION_LABEL[lot.condition] : ''}
          {lot.size_cm ? ` · ${lot.size_cm}` : ''}
          {lot.year ? ` · ${lot.year}` : ''}
          {lot.sku ? ` · ${lot.sku}` : ''}
        </p>
      </div>

      <div className="mx-auto mt-6 aspect-[16/9] w-full max-w-3xl overflow-hidden border border-border">
        <VaultImage path={lot.image_urls?.[0]} alt={`${lot.title} water ski`} className="h-full w-full" loading="eager" />
      </div>

      <div className="mt-8 text-center">
        <p className="vault-kicker text-[9px] text-muted-foreground">Bidding opens in</p>
        <BigCountdown target={lot.drop_opens_at ?? null} now={now} className="mt-3" />
        <p className="mt-4 font-mono text-lg tabular-nums">Opening bid {usd(price)}</p>
        {comp ? (
          <p className="mt-1 text-sm text-muted-foreground">Comparable used market: {usd(comp)}</p>
        ) : null}
      </div>

      <div className="mt-10">
        <AlertMe skiId={lot.id} />
      </div>

      {lot.provenance ? (
        <section className="mx-auto mt-12 max-w-3xl border-l-4 border-primary bg-card/70 px-5 py-5">
          <p className="vault-kicker text-[10px] tracking-[0.3em] text-primary">The Story</p>
          <div className="vault-rule my-3 w-12" />
          <p className="vault-serif whitespace-pre-line text-xl italic leading-relaxed sm:text-2xl">
            {lot.provenance}
          </p>
        </section>
      ) : null}

      <div className="mx-auto mt-8 grid max-w-3xl gap-6 md:grid-cols-2">
        <MilestoneLadder milestones={milestones} price={price} />
        <GuessGame skiId={lot.id} closesAt={closes} now={now} />
      </div>

      {lot.description ? (
        <div className="mx-auto mt-8 max-w-3xl">
          <p className="vault-kicker text-[9px] text-muted-foreground">Condition notes</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{lot.description}</p>
        </div>
      ) : null}
    </section>
  );
};

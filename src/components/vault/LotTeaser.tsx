import silhouette from '@/assets/vault-silhouette.png';
import { BigCountdown } from './BigCountdown';
import { NotifyMe } from './NotifyMe';
import { clueSchedule, lotLabel, timeLeftParts } from '@/lib/vault';
import type { VaultLot } from './LotCard';

/**
 * TEASER (Wed → Fri). The real photo is never sent to the browser during this
 * window — the API withholds image_urls, so all we can render is a silhouette.
 */
export const LotTeaser = ({ lot, now }: { lot: VaultLot; now: number }) => {
  const { visible, nextAt } = clueSchedule(lot.teaser_at, lot.teaser_clues, now);
  const nextClue = timeLeftParts(nextAt, now);

  return (
    <section className="text-center">
      <p className="vault-kicker text-[10px] text-primary">In the vault</p>
      <h1 className="vault-serif mt-2 text-6xl leading-none tracking-[0.12em] sm:text-8xl">
        {lotLabel(lot.lot_number)}
      </h1>

      <div className="relative mx-auto mt-6 flex aspect-[16/9] w-full max-w-3xl items-center justify-center overflow-hidden border border-border bg-secondary">
        <img
          src={silhouette}
          alt="Silhouette of an unrevealed water ski"
          width={1024}
          height={1024}
          className="w-[85%] opacity-90 [filter:brightness(0)_blur(1.5px)] dark:invert-0"
        />
        <span className="absolute bottom-3 right-4 vault-kicker text-[9px] text-muted-foreground">
          Unrevealed
        </span>
      </div>

      {lot.teaser_headline ? (
        <p className="vault-serif mx-auto mt-8 max-w-2xl text-3xl italic leading-snug sm:text-4xl">
          {lot.teaser_headline}
        </p>
      ) : null}

      {visible.length ? (
        <ul className="mx-auto mt-8 max-w-md space-y-2 text-left">
          {visible.map((c, i) => (
            <li key={c} className="animate-fade-in border-l-2 border-primary bg-card/60 px-4 py-3 text-sm">
              <span className="vault-kicker mr-2 text-[9px] text-primary">Clue {i + 1}</span>
              {c}
            </li>
          ))}
          {nextClue && !nextClue.ended ? (
            <li className="border-l-2 border-border px-4 py-3 text-sm text-muted-foreground">
              <span className="vault-kicker mr-2 text-[9px]">Clue {visible.length + 1}</span>
              unlocks in {nextClue.d ? `${nextClue.d}d ` : ''}
              {nextClue.h}h {nextClue.m}m
            </li>
          ) : null}
        </ul>
      ) : null}

      <div className="mt-10">
        <p className="vault-kicker text-[9px] text-muted-foreground">Bidding opens</p>
        <BigCountdown target={lot.drop_opens_at ?? null} now={now} className="mt-3" />
      </div>

      <div className="mt-10">
        <NotifyMe skiId={lot.id} />
      </div>
    </section>
  );
};
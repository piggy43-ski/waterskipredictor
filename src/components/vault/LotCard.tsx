import { Link } from 'react-router-dom';
import { VaultImage } from './VaultImage';
import { VaultCountdown } from './VaultCountdown';
import { CONDITION_LABEL, usd, VaultCondition } from '@/lib/vault';

export interface VaultLot {
  id: string;
  title: string;
  brand: string;
  model: string;
  lot_number?: number | null;
  reveal_state?: 'hidden' | 'teaser' | 'revealed' | null;
  teaser_headline?: string | null;
  teaser_clues?: string[] | null;
  teaser_at?: string | null;
  drop_opens_at?: string | null;
  drop_closes_at?: string | null;
  highest_bidder_id?: string | null;
  sku?: string | null;
  specs_confirmed?: boolean | null;
  is_consigned?: boolean | null;
  size_cm: string | null;
  year: string | null;
  description: string | null;
  provenance?: string | null;
  market_price?: number | null;
  market_source?: string | null;
  consignor_slug?: string | null;
  condition: VaultCondition;
  image_urls: string[];
  listing_type: 'auction' | 'buy_now';
  start_price: number;
  buy_now_price: number | null;
  current_price: number;
  bid_count: number;
  closes_at: string | null;
  status: string;
  retail_price: number | null;
  reserve_met?: boolean | null;
}

export const LotCard = ({ lot, now, index }: { lot: VaultLot; now: number; index: number }) => {
  const isAuction = lot.listing_type === 'auction';
  const live = lot.status === 'live';

  return (
    <Link
      to={`/vault/ski/${lot.id}`}
      className="group block border border-border bg-card transition-colors hover:border-primary/60"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <VaultImage
          path={lot.image_urls?.[0]}
          alt={`${lot.title} water ski`}
          className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute left-0 top-0 bg-background/85 px-2 py-1 vault-kicker text-[9px] text-primary">
          Lot {String(index + 1).padStart(2, '0')}
        </span>
        {!isAuction && (
          <span className="absolute right-0 top-0 bg-primary px-2 py-1 vault-kicker text-[9px] text-primary-foreground">
            Buy Now
          </span>
        )}
      </div>

      <div className="space-y-2 p-3">
        {lot.sku && (
          <p className="font-mono text-[10px] text-muted-foreground">{lot.sku}</p>
        )}
        <p className="vault-kicker text-[9px] text-muted-foreground">
          {CONDITION_LABEL[lot.condition]}
          {lot.size_cm ? ` · ${lot.size_cm}` : ''}
          {lot.year ? ` · ${lot.year}` : ''}
        </p>
        <h3 className="vault-serif text-lg leading-tight">{lot.title}</h3>

        <div className="flex items-end justify-between pt-1">
          <div>
            <p className="vault-kicker text-[9px] text-muted-foreground">
              {isAuction ? (lot.bid_count ? 'Current bid' : 'Opening bid') : 'Price'}
            </p>
            <p className="font-mono text-lg tabular-nums">
              {usd(isAuction ? (lot.bid_count ? lot.current_price : lot.start_price) : lot.buy_now_price)}
            </p>
          </div>
          <div className="text-right">
            {isAuction && (
              <>
                <p className="vault-kicker text-[9px] text-muted-foreground">
                  {lot.bid_count} bid{lot.bid_count === 1 ? '' : 's'}
                </p>
                {live ? (
                  <VaultCountdown closesAt={lot.closes_at} now={now} compact />
                ) : (
                  <span className="vault-kicker text-[10px] text-muted-foreground">
                    {lot.status === 'scheduled' ? 'Opens soon' : 'Closed'}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {isAuction && lot.bid_count > 0 && (
          <p className="vault-kicker text-[9px]">
            {lot.reserve_met ? (
              <span className="text-primary">Reserve met</span>
            ) : (
              <span className="text-muted-foreground">Reserve not met</span>
            )}
          </p>
        )}
      </div>
    </Link>
  );
};
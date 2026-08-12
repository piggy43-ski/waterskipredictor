import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { VaultBidderSetup } from './VaultBidderSetup';
import { bidIncrement, minNextBid, usd, VAULT_ANTI_SNIPE_MINUTES, VAULT_REQUIRE_PAYMENT_METHOD } from '@/lib/vault';
import type { VaultLot } from './LotCard';

interface Props {
  lot: VaultLot;
  now: number;
  onBidPlaced: () => void;
}

/** Two panels: the one-tap minimum bid, and the proxy maximum. */
export const BidPanel = ({ lot, now, onBidPlaced }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [pending, setPending] = useState<number | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const price = Number(lot.bid_count ? lot.current_price : lot.start_price);
  const min = useMemo(
    () => minNextBid(Number(lot.current_price), lot.bid_count, Number(lot.start_price)),
    [lot.current_price, lot.bid_count, lot.start_price]
  );
  const increment = bidIncrement(price);
  const suggestedMax = min + increment * 3;

  const ended = lot.status !== 'live' || (lot.closes_at ? new Date(lot.closes_at).getTime() <= now : false);

  const ensureProfile = async () => {
    const { data } = await supabase
      .from('vault_bidder_profiles')
      .select('user_id, bidding_terms_accepted_at, is_verified, stripe_payment_method_id')
      .eq('user_id', user!.id)
      .maybeSingle();
    if (!data || !data.bidding_terms_accepted_at) return false;
    if (VAULT_REQUIRE_PAYMENT_METHOD && !(data.is_verified && data.stripe_payment_method_id)) return false;
    return true;
  };

  const startBid = async (value: number) => {
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!value || value < min) {
      toast({ title: `Minimum bid is ${usd(min)}`, variant: 'destructive' });
      return;
    }
    if (!(await ensureProfile())) {
      setPending(value);
      setSetupOpen(true);
      return;
    }
    setPending(value);
  };

  const submit = async () => {
    if (pending === null) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc('vault_place_bid', { p_ski_id: lot.id, p_max_bid: pending });
    setSubmitting(false);
    setPending(null);
    if (error) {
      if (error.message?.includes('PAYMENT_SETUP_REQUIRED')) {
        setSetupOpen(true);
        toast({
          title: 'Add a card to bid',
          description: 'Bids are binding, so we need a card on file before your first one.',
        });
        return;
      }
      toast({ title: 'Bid not accepted', description: error.message, variant: 'destructive' });
      return;
    }
    const res = data as { leading?: boolean; current_price?: number; extended?: boolean };
    toast({
      title: res?.leading ? "You're the high bidder" : 'Outbid instantly',
      description: `${res?.leading ? 'Current price' : 'Price is now'} ${usd(Number(res?.current_price))}${
        res?.extended ? ` · Closing extended ${VAULT_ANTI_SNIPE_MINUTES} min` : ''
      }`,
    });
    setAmount('');
    onBidPlaced();
  };

  if (lot.listing_type === 'buy_now') return null;

  if (ended) {
    return (
      <div className="vault-panel px-5 py-6">
        <p className="vault-label text-center">Bidding closed</p>
      </div>
    );
  }

  return (
    <>
      {/* One-tap minimum bid */}
      <div className="vault-panel px-5 py-5">
        <p className="vault-label">Minimum bid {usd(min)}</p>
        <button
          type="button"
          onClick={() => void startBid(min)}
          disabled={submitting}
          className="vault-display mt-4 w-full bg-primary px-4 py-5 text-[26px] leading-none text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          Bid {usd(min)}
        </button>
      </div>

      {/* Proxy maximum */}
      <div className="vault-panel px-5 py-5">
        <p className="vault-label">Set a maximum</p>
        <div className="mt-4 flex gap-3">
          <input
            inputMode="decimal"
            placeholder={String(suggestedMax)}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            aria-label="Maximum bid in dollars"
            className="vault-mono min-w-0 flex-1 border border-border bg-transparent px-4 py-3 text-lg text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <button
            type="button"
            onClick={() => void startBid(Number(amount || suggestedMax))}
            disabled={submitting}
            className="shrink-0 border border-primary px-6 py-3 text-base text-primary-glow transition-colors hover:bg-primary/10 disabled:opacity-60"
          >
            Set max
          </button>
        </div>
        <p className="vault-body-copy mt-4 text-[15px] leading-relaxed">
          We bid for you only as high as needed, one increment at a time, up to your maximum. Nobody sees it.
          Any bid in the final {VAULT_ANTI_SNIPE_MINUTES} minutes extends the lot by {VAULT_ANTI_SNIPE_MINUTES}{' '}
          minutes. <span className="vault-mono text-primary-glow">Current increment: {usd(increment)}.</span>
        </p>
      </div>

      <VaultBidderSetup open={setupOpen} onOpenChange={setSetupOpen} onSaved={() => setPending((p) => p)} />

      <AlertDialog open={pending !== null && !setupOpen} onOpenChange={(o) => !o && setPending(null)}>
        <AlertDialogContent className="vault-theme bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="vault-display uppercase tracking-[0.12em]">Confirm your bid</AlertDialogTitle>
            <AlertDialogDescription>
              You are committing up to <strong className="text-foreground">{usd(Number(pending ?? 0))}</strong> for{' '}
              {lot.title}. This is a binding bid and cannot be retracted. Shipping is added at checkout.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submit} disabled={submitting}>
              {submitting ? 'Placing…' : 'Confirm bid'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { VaultBidderSetup } from './VaultBidderSetup';
import { minNextBid, usd, VAULT_ANTI_SNIPE_MINUTES, VAULT_REQUIRE_PAYMENT_METHOD } from '@/lib/vault';
import type { VaultLot } from './LotCard';

interface Props {
  lot: VaultLot;
  now: number;
  onBidPlaced: () => void;
}

export const BidPanel = ({ lot, now, onBidPlaced }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const min = useMemo(
    () => minNextBid(Number(lot.current_price), lot.bid_count, Number(lot.start_price)),
    [lot.current_price, lot.bid_count, lot.start_price]
  );

  const ended = lot.status !== 'live' || (lot.closes_at ? new Date(lot.closes_at).getTime() <= now : false);

  const quick = [min, min + 25, min + 50];

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

  const startBid = async () => {
    if (!user) {
      navigate('/auth');
      return;
    }
    const value = Number(amount);
    if (!value || value < min) {
      toast({ title: `Minimum bid is ${usd(min)}`, variant: 'destructive' });
      return;
    }
    if (!(await ensureProfile())) {
      setSetupOpen(true);
      return;
    }
    setConfirming(true);
  };

  const submit = async () => {
    setSubmitting(true);
    const { data, error } = await supabase.rpc('vault_place_bid', {
      p_ski_id: lot.id,
      p_max_bid: Number(amount),
    });
    setSubmitting(false);
    setConfirming(false);
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

  return (
    <div className="border border-border bg-card p-4">
      {ended ? (
        <p className="vault-kicker text-center text-[11px] text-muted-foreground">Bidding closed</p>
      ) : (
        <>
          <p className="vault-kicker text-[9px] text-muted-foreground">Your maximum bid</p>
          <p className="mb-3 text-xs text-muted-foreground">
            We bid for you in {usd(min - Number(lot.bid_count ? lot.current_price : lot.start_price)) } steps, only as high as needed.
          </p>
          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              placeholder={String(min)}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              className="font-mono"
              aria-label="Maximum bid in dollars"
            />
            <Button onClick={startBid} disabled={submitting}>
              Place bid
            </Button>
          </div>
          <div className="mt-2 flex gap-2">
            {quick.map((q) => (
              <button
                key={q}
                onClick={() => setAmount(String(q))}
                className="flex-1 border border-border py-1 font-mono text-xs hover:border-primary"
              >
                {usd(q)}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Bids are binding. Any bid in the final {VAULT_ANTI_SNIPE_MINUTES} minutes extends the lot by{' '}
            {VAULT_ANTI_SNIPE_MINUTES} minutes.
          </p>
        </>
      )}

      <VaultBidderSetup open={setupOpen} onOpenChange={setSetupOpen} onSaved={() => setConfirming(true)} />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="vault-theme bg-background text-foreground">
          <AlertDialogHeader>
            <AlertDialogTitle className="vault-serif uppercase tracking-[0.15em]">Confirm your bid</AlertDialogTitle>
            <AlertDialogDescription>
              You are committing up to <strong className="text-foreground">{usd(Number(amount))}</strong> for{' '}
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
    </div>
  );
};
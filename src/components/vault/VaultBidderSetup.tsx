import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { usd, zoneForState, pickupLabel, getVaultRef } from '@/lib/vault';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

interface Shipping {
  full_name: string;
  phone: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  postal_code: string;
  local_pickup: boolean;
}

/** Inner form — needs the Elements provider above it. */
const SetupForm = ({
  shipping,
  onDone,
}: {
  shipping: Shipping;
  onDone: () => void;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!stripe || !elements) return;
    setSaving(true);
    const { error, setupIntent } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
    });
    if (error || !setupIntent?.payment_method) {
      setSaving(false);
      toast({ title: 'Card not saved', description: error?.message ?? 'Please try again.', variant: 'destructive' });
      return;
    }
    const { data, error: fnError } = await supabase.functions.invoke('vault-setup-payment', {
      body: {
        action: 'confirm',
        payment_method_id: String(setupIntent.payment_method),
        shipping,
        source: getVaultRef(),
      },
    });
    setSaving(false);
    if (fnError || (data as { error?: string })?.error) {
      toast({
        title: 'Could not complete setup',
        description: (data as { error?: string })?.error ?? fnError?.message,
        variant: 'destructive',
      });
      return;
    }
    toast({ title: "You're set to bid", description: 'Card saved. Bids are binding from here.' });
    onDone();
  };

  return (
    <div className="space-y-3">
      <PaymentElement options={{ layout: 'tabs' }} />
      <Button className="w-full" onClick={submit} disabled={!stripe || saving}>
        {saving ? 'Saving…' : 'Save card & start bidding'}
      </Button>
    </div>
  );
};

export const VaultBidderSetup = ({ open, onOpenChange, onSaved }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
  });
  const [pickup, setPickup] = useState(false);
  const [terms, setTerms] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise, setStripePromise] = useState<Promise<StripeJs | null> | null>(null);
  const [starting, setStarting] = useState(false);

  const { data: zones = [] } = useQuery({
    queryKey: ['vault-zones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vault_shipping_zones').select('*').order('zone');
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!open) {
      setClientSecret(null);
      setStarting(false);
    }
  }, [open]);

  const matched = pickup ? { zone: 5, price: 0 } : zoneForState(form.state, zones as never);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const shipping: Shipping = { ...form, local_pickup: pickup };

  const startCardCapture = async () => {
    if (!user) return;
    if (!terms) return toast({ title: 'Please accept the bidding terms', variant: 'destructive' });
    if (!form.full_name || (!pickup && (!form.address_line1 || !form.state || !form.postal_code))) {
      return toast({ title: 'Please complete your shipping details', variant: 'destructive' });
    }
    if (!pickup && !matched) {
      return toast({
        title: 'We do not ship to that state yet',
        description: 'Contact us for a quote.',
        variant: 'destructive',
      });
    }
    setStarting(true);
    const { data, error } = await supabase.functions.invoke('vault-setup-payment', { body: { action: 'init' } });
    setStarting(false);
    const res = data as { client_secret?: string; publishable_key?: string | null; error?: string };
    if (error || res?.error || !res?.client_secret) {
      return toast({
        title: 'Could not start card setup',
        description: res?.error ?? error?.message,
        variant: 'destructive',
      });
    }
    if (!res.publishable_key) {
      return toast({
        title: 'Card setup unavailable',
        description: 'Stripe is not fully configured yet. Please try again shortly.',
        variant: 'destructive',
      });
    }
    setStripePromise(loadStripe(res.publishable_key));
    setClientSecret(res.client_secret);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="vault-theme max-h-[90vh] overflow-y-auto bg-background text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="vault-serif text-2xl uppercase tracking-[0.15em]">Before your first bid</DialogTitle>
          <DialogDescription>
            One-time setup: where it ships, the card we charge if you win, and the binding-bid agreement.
          </DialogDescription>
        </DialogHeader>

        {clientSecret && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#c9a227' } } }}
          >
            <div className="mb-3 border border-border bg-secondary/40 p-3 text-sm">
              <span className="vault-kicker text-[9px] text-muted-foreground">Shipping</span>
              <p className="font-mono">
                {pickup ? `${pickupLabel(zones as never)} — free` : `Zone ${matched?.zone} — ${usd(matched?.price ?? 0)}`}
              </p>
            </div>
            <SetupForm
              shipping={shipping}
              onDone={() => {
                onSaved();
                onOpenChange(false);
              }}
            />
          </Elements>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="v-name">Full name</Label>
              <Input id="v-name" value={form.full_name} onChange={set('full_name')} />
            </div>
            <div>
              <Label htmlFor="v-phone">Phone</Label>
              <Input id="v-phone" value={form.phone} onChange={set('phone')} />
            </div>

            <label className="flex items-center gap-2 py-1 text-sm">
              <Checkbox checked={pickup} onCheckedChange={(v) => setPickup(!!v)} />
              {pickupLabel(zones as never)} — free
            </label>

            {!pickup && (
              <>
                <div>
                  <Label htmlFor="v-a1">Address</Label>
                  <Input id="v-a1" value={form.address_line1} onChange={set('address_line1')} />
                </div>
                <div>
                  <Label htmlFor="v-a2">Apt / Suite</Label>
                  <Input id="v-a2" value={form.address_line2} onChange={set('address_line2')} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="v-city">City</Label>
                    <Input id="v-city" value={form.city} onChange={set('city')} />
                  </div>
                  <div>
                    <Label htmlFor="v-state">State</Label>
                    <Input id="v-state" maxLength={2} value={form.state} onChange={set('state')} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="v-zip">ZIP</Label>
                  <Input id="v-zip" value={form.postal_code} onChange={set('postal_code')} />
                </div>
              </>
            )}

            <div className="border border-border bg-secondary/40 p-3 text-sm">
              <span className="vault-kicker text-[9px] text-muted-foreground">Shipping</span>
              <p className="font-mono">
                {matched ? `Zone ${matched.zone} — ${usd(matched.price)}` : 'Enter your state to see shipping'}
              </p>
            </div>

            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <Checkbox checked={terms} onCheckedChange={(v) => setTerms(!!v)} className="mt-0.5" />
              <span>
                I understand bids in The Vault are <strong className="text-foreground">binding</strong>. If I win, the card
                I save here is charged automatically for the hammer price plus shipping. Bids cannot be retracted. See the{' '}
                <Link to="/vault/terms" target="_blank" className="text-primary underline">
                  Vault terms
                </Link>
                .
              </span>
            </label>

            <Button className="w-full" onClick={startCardCapture} disabled={starting}>
              {starting ? 'Loading…' : 'Continue to card'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

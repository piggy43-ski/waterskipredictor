import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { usd, zoneForState, VAULT_PICKUP_LOCATION } from '@/lib/vault';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export const VaultBidderSetup = ({ open, onOpenChange, onSaved }: Props) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
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

  const { data: zones = [] } = useQuery({
    queryKey: ['vault-zones'],
    queryFn: async () => {
      const { data, error } = await supabase.from('vault_shipping_zones').select('*').order('zone');
      if (error) throw error;
      return data;
    },
  });

  const matched = pickup ? { zone: 5, price: 0 } : zoneForState(form.state, zones as never);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!user) return;
    if (!terms) {
      toast({ title: 'Please accept the bidding terms', variant: 'destructive' });
      return;
    }
    if (!form.full_name || (!pickup && (!form.address_line1 || !form.state || !form.postal_code))) {
      toast({ title: 'Please complete your shipping details', variant: 'destructive' });
      return;
    }
    if (!pickup && !matched) {
      toast({ title: 'We do not ship to that state yet', description: 'Contact us for a quote.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('vault_bidder_profiles').upsert({
      user_id: user.id,
      ...form,
      country: 'US',
      local_pickup: pickup,
      shipping_zone: matched?.zone ?? null,
      bidding_terms_accepted_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save details', description: error.message, variant: 'destructive' });
      return;
    }
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="vault-theme max-h-[90vh] overflow-y-auto bg-background text-foreground sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="vault-serif text-2xl uppercase tracking-[0.15em]">Bidder Details</DialogTitle>
          <DialogDescription>
            One-time setup. Bids are binding — we need somewhere to send the ski.
          </DialogDescription>
        </DialogHeader>

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
            Local pickup — {VAULT_PICKUP_LOCATION} (free)
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
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
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
              I understand bids in The Vault are <strong className="text-foreground">binding</strong>. If I win, I agree to pay
              the hammer price plus shipping. Bids cannot be retracted.
            </span>
          </label>

          <Button className="w-full" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save & continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
import { useState } from 'react';
import { z } from 'zod';
import { Loader2, ShoppingBag, Gift, Trophy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';

export type RedemptionCategory = 'gear' | 'store_credit' | 'elite_skis' | string;

export interface RedemptionFormData {
  // gear
  glove_size?: string;
  shipping_name?: string;
  shipping_address_line1?: string;
  shipping_address_line2?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
  shipping_phone?: string;
  // store_credit
  gift_card_email?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rewardName: string;
  rewardCategory: RedemptionCategory;
  requiredTokens: number;
  walletBalance: number;
  defaultEmail: string;
  isSubmitting: boolean;
  onConfirm: (formData: RedemptionFormData) => void;
}

const GLOVE_SIZES = ['XXS', 'XS', 'S', 'M', 'L', 'XL'];
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
];

const gearSchema = z.object({
  glove_size: z.enum(['XXS','XS','S','M','L','XL'], { errorMap: () => ({ message: 'Select a glove size' }) }),
  shipping_name: z.string().trim().min(1, 'Required').max(100),
  shipping_address_line1: z.string().trim().min(1, 'Required').max(200),
  shipping_address_line2: z.string().trim().max(200).optional().or(z.literal('')),
  shipping_city: z.string().trim().min(1, 'Required').max(100),
  shipping_state: z.string().length(2, 'Pick a state'),
  shipping_zip: z.string().regex(/^\d{5}$/, '5-digit ZIP'),
  shipping_phone: z.string().trim().min(7, 'Required').max(30),
});

const giftCardSchema = z.object({
  gift_card_email: z.string().trim().email('Valid email required').max(255),
});

export function RedemptionFormDialog({
  open, onOpenChange, rewardName, rewardCategory,
  requiredTokens, walletBalance, defaultEmail, isSubmitting, onConfirm,
}: Props) {
  const [form, setForm] = useState<RedemptionFormData>({
    gift_card_email: defaultEmail,
    shipping_state: '',
    glove_size: undefined,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (k: keyof RedemptionFormData) => (v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = () => {
    setErrors({});
    if (rewardCategory === 'gear') {
      const parsed = gearSchema.safeParse(form);
      if (!parsed.success) {
        const flat: Record<string, string> = {};
        for (const issue of parsed.error.issues) flat[issue.path.join('.')] = issue.message;
        setErrors(flat);
        return;
      }
      onConfirm(parsed.data as RedemptionFormData);
    } else if (rewardCategory === 'store_credit') {
      const parsed = giftCardSchema.safeParse({ gift_card_email: form.gift_card_email });
      if (!parsed.success) {
        setErrors({ gift_card_email: parsed.error.issues[0]?.message ?? 'Invalid' });
        return;
      }
      onConfirm({ gift_card_email: parsed.data.gift_card_email });
    } else {
      // elite_skis — no form
      onConfirm({});
    }
  };

  const balanceAfter = walletBalance - requiredTokens;
  const Icon = rewardCategory === 'store_credit' ? Gift : rewardCategory === 'elite_skis' ? Trophy : ShoppingBag;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Redeem {rewardName}</DialogTitle>
              <DialogDescription className="text-xs">
                {requiredTokens.toLocaleString()} tokens · Balance after: {balanceAfter.toLocaleString()}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {rewardCategory === 'gear' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Glove size *</Label>
              <Select value={form.glove_size} onValueChange={set('glove_size')}>
                <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                <SelectContent>
                  {GLOVE_SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {errors.glove_size && <p className="text-xs text-destructive">{errors.glove_size}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Shipping name *</Label>
              <Input value={form.shipping_name || ''} onChange={(e) => set('shipping_name')(e.target.value)} />
              {errors.shipping_name && <p className="text-xs text-destructive">{errors.shipping_name}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Address line 1 *</Label>
              <Input value={form.shipping_address_line1 || ''} onChange={(e) => set('shipping_address_line1')(e.target.value)} />
              {errors.shipping_address_line1 && <p className="text-xs text-destructive">{errors.shipping_address_line1}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Address line 2</Label>
              <Input value={form.shipping_address_line2 || ''} onChange={(e) => set('shipping_address_line2')(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">City *</Label>
                <Input value={form.shipping_city || ''} onChange={(e) => set('shipping_city')(e.target.value)} />
                {errors.shipping_city && <p className="text-xs text-destructive">{errors.shipping_city}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">State *</Label>
                <Select value={form.shipping_state} onValueChange={set('shipping_state')}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                {errors.shipping_state && <p className="text-xs text-destructive">{errors.shipping_state}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">ZIP *</Label>
                <Input
                  inputMode="numeric"
                  maxLength={5}
                  value={form.shipping_zip || ''}
                  onChange={(e) => set('shipping_zip')(e.target.value.replace(/\D/g, ''))}
                />
                {errors.shipping_zip && <p className="text-xs text-destructive">{errors.shipping_zip}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone *</Label>
                <Input value={form.shipping_phone || ''} onChange={(e) => set('shipping_phone')(e.target.value)} />
                {errors.shipping_phone && <p className="text-xs text-destructive">{errors.shipping_phone}</p>}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Free US shipping. Allow 5–10 business days.</p>
          </div>
        )}

        {rewardCategory === 'store_credit' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Email for gift card delivery *</Label>
              <Input
                type="email"
                value={form.gift_card_email || ''}
                onChange={(e) => set('gift_card_email')(e.target.value)}
              />
              {errors.gift_card_email && <p className="text-xs text-destructive">{errors.gift_card_email}</p>}
            </div>
            <p className="text-xs text-muted-foreground">Digital gift card delivered by email within 24 hours.</p>
          </div>
        )}

        {rewardCategory === 'elite_skis' && (
          <Card className="p-4 bg-primary/5 border-primary/30">
            <p className="text-sm leading-6">
              <strong>Elite tier redemption confirmed.</strong> Robert will contact you within 48 hours
              to confirm specs and arrange delivery. Your tokens are reserved.
            </p>
          </Card>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Redeem ${requiredTokens.toLocaleString()} tokens`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
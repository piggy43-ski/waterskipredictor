import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VaultLayout } from '@/components/vault/VaultLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

const empty = {
  brand: '',
  model: '',
  size_cm: '',
  year: '',
  condition: 'ridden',
  asking_price: '',
  notes: '',
  contact_name: '',
  contact_email: '',
  contact_phone: '',
};

const VaultConsign = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState({ ...empty });
  const [files, setFiles] = useState<FileList | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    if (!form.brand.trim() || !form.model.trim() || !form.contact_name.trim() || !form.contact_email.trim()) {
      toast({ title: 'Missing details', description: 'Brand, model, your name and email are required.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const image_urls: string[] = [];
      for (const file of Array.from(files ?? [])) {
        const path = `consign/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
        const { error } = await supabase.storage.from('vault-photos').upload(path, file);
        if (!error) image_urls.push(path);
      }
      const { error } = await supabase.from('vault_consignment_submissions').insert({
        brand: form.brand.trim(),
        model: form.model.trim(),
        size_cm: form.size_cm || null,
        year: form.year || null,
        condition: form.condition as 'brand_new' | 'barely_ridden' | 'ridden',
        asking_price: form.asking_price ? Number(form.asking_price) : null,
        notes: form.notes || null,
        image_urls,
        contact_name: form.contact_name.trim(),
        contact_email: form.contact_email.trim(),
        contact_phone: form.contact_phone || null,
        user_id: user?.id ?? null,
      });
      if (error) throw error;
      setDone(true);
    } catch (e) {
      toast({ title: 'Could not send', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <VaultLayout
      title="Consign your gear — The Vault"
      description="Sell your old skis through The Vault. Tell us what you have and we'll come back to you."
    >
      <h1 className="vault-serif text-3xl uppercase tracking-[0.12em]">Consign your gear</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Got skis sitting in the garage? Send them through The Vault. We photograph, list, run the auction and handle
        payment and shipping.
      </p>

      <div className="mt-4 border border-border bg-card p-4">
        <p className="vault-kicker text-[9px] text-muted-foreground">The split</p>
        <p className="mt-1 text-sm">
          You keep <span className="font-mono">75%</span> of the hammer price. The Vault keeps{' '}
          <span className="font-mono">25%</span>. Shipping is paid by the buyer and is never commissionable. Your name
          is never shown publicly unless you ask for it.
        </p>
      </div>

      {done ? (
        <div className="mt-6 border border-border bg-card p-6 text-center">
          <p className="vault-serif text-2xl uppercase tracking-[0.12em]">Got it</p>
          <p className="mt-2 text-sm text-muted-foreground">
            We'll email you at {form.contact_email} once we've had a look.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-3 border border-border p-4 sm:grid-cols-2">
          <div><Label>Brand</Label><Input value={form.brand} onChange={f('brand')} /></div>
          <div><Label>Model</Label><Input value={form.model} onChange={f('model')} /></div>
          <div><Label>Length (cm)</Label><Input value={form.size_cm} onChange={f('size_cm')} /></div>
          <div><Label>Year</Label><Input value={form.year} onChange={f('year')} /></div>
          <div>
            <Label>Condition</Label>
            <select
              className="h-10 w-full border border-border bg-input px-2 text-sm"
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
            >
              <option value="brand_new">Brand New</option>
              <option value="barely_ridden">Barely Ridden</option>
              <option value="ridden">Ridden</option>
            </select>
          </div>
          <div><Label>What you'd like to get ($)</Label><Input value={form.asking_price} onChange={f('asking_price')} /></div>
          <div className="sm:col-span-2"><Label>Anything we should know</Label><Textarea rows={3} value={form.notes} onChange={f('notes')} /></div>
          <div className="sm:col-span-2">
            <Label>Photos</Label>
            <Input type="file" multiple accept="image/*" onChange={(e) => setFiles(e.target.files)} />
          </div>
          <div><Label>Your name</Label><Input value={form.contact_name} onChange={f('contact_name')} /></div>
          <div><Label>Email</Label><Input type="email" value={form.contact_email} onChange={f('contact_email')} /></div>
          <div className="sm:col-span-2"><Label>Phone (optional)</Label><Input value={form.contact_phone} onChange={f('contact_phone')} /></div>
          <Button className="sm:col-span-2" onClick={submit} disabled={saving}>
            {saving ? 'Sending…' : 'Send it in'}
          </Button>
        </div>
      )}
    </VaultLayout>
  );
};

export default VaultConsign;

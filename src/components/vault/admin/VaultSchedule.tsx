import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { usd, lotStage, lotLabel } from '@/lib/vault';
import type { VaultLot } from '@/components/vault/LotCard';
import { LotTeaser } from '@/components/vault/LotTeaser';
import { LotLive } from '@/components/vault/LotLive';
import { LotSold } from '@/components/vault/LotSold';
import { GripVertical } from 'lucide-react';

type Row = VaultLot & { reserve_price?: number | null; teaser_at?: string | null; opens_at?: string | null };

const localValue = (iso?: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

/**
 * Weekly-format control panel: order the eleven lots, write teaser copy,
 * preview any of the four public states at a simulated time, and read the
 * post-close report for the lot that just ran.
 */
export const VaultSchedule = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ lot: Row; at: number } | null>(null);
  const [simAt, setSimAt] = useState('');

  const { data: lots = [], isLoading } = useQuery({
    queryKey: ['vault-schedule-lots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vault_skis')
        .select('*')
        .order('lot_number', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const save = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from('vault_skis').update(patch).eq('id', id);
    if (error) return toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
    qc.invalidateQueries({ queryKey: ['vault-schedule-lots'] });
  };

  const reorder = async (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const list = [...lots];
    const from = list.findIndex((l) => l.id === dragId);
    const to = list.findIndex((l) => l.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    setDragId(null);
    await Promise.all(
      list.map((l, i) => supabase.from('vault_skis').update({ lot_number: i + 1, sort_order: i + 1 }).eq('id', l.id))
    );
    qc.invalidateQueries({ queryKey: ['vault-schedule-lots'] });
    toast({ title: 'Lot order updated' });
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading schedule…</p>;

  if (preview) {
    const stage = lotStage(preview.lot, preview.at);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between border border-border p-3">
          <p className="vault-kicker text-[10px] text-primary">
            Previewing {lotLabel(preview.lot.lot_number)} — state: {stage}
          </p>
          <Button size="sm" variant="outline" onClick={() => setPreview(null)}>
            Exit preview
          </Button>
        </div>
        {stage === 'teaser' || stage === 'hidden' ? (
          <LotTeaser lot={preview.lot} now={preview.at} />
        ) : stage === 'sold' ? (
          <LotSold lot={preview.lot} next={null} now={preview.at} />
        ) : (
          <LotLive lot={preview.lot} now={preview.at} closing={stage === 'closing'} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-border p-3">
        <Label>Simulated time for previews</Label>
        <Input type="datetime-local" value={simAt} onChange={(e) => setSimAt(e.target.value)} />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Leave blank to preview at the real server time. Previews are local only — nothing is published.
        </p>
      </div>

      {lots.map((l) => {
        const stage = lotStage(l, Date.now());
        const closed = ['sold', 'ended_met', 'ended_no_reserve_met'].includes(l.status);
        return (
          <div
            key={l.id}
            draggable
            onDragStart={() => setDragId(l.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => reorder(l.id)}
            className="border border-border p-3"
          >
            <div className="flex items-start gap-3">
              <GripVertical className="mt-1 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
              <div className="flex-1">
                <p className="vault-serif text-lg">
                  {lotLabel(l.lot_number)} — {l.title}
                </p>
                <p className="vault-kicker text-[9px] text-muted-foreground">
                  db: {l.status} · public state: {stage} · {l.bid_count} bids · {usd(Number(l.current_price))}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPreview({ lot: l, at: simAt ? new Date(simAt).getTime() : Date.now() })
                }
              >
                Preview
              </Button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Teaser at (Wed)</Label>
                <Input
                  type="datetime-local"
                  defaultValue={localValue(l.teaser_at)}
                  onBlur={(e) => save(l.id, { teaser_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
              <div>
                <Label>Closes at (Sun)</Label>
                <Input
                  type="datetime-local"
                  defaultValue={localValue(l.closes_at)}
                  onBlur={(e) => save(l.id, { closes_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Teaser headline</Label>
                <Input
                  defaultValue={l.teaser_headline ?? ''}
                  onBlur={(e) => save(l.id, { teaser_headline: e.target.value || null })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Teaser clues — one per line, released 12 hours apart</Label>
                <Textarea
                  rows={3}
                  defaultValue={(l.teaser_clues ?? []).join('\n')}
                  onBlur={(e) =>
                    save(l.id, {
                      teaser_clues: e.target.value
                        .split('\n')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => save(l.id, { status: 'scheduled' })}>
                Force teaser
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  l.specs_confirmed
                    ? save(l.id, { status: 'live', opens_at: new Date().toISOString() })
                    : toast({
                        title: 'Specs not confirmed',
                        description: 'Confirm brand and model before forcing a lot live.',
                        variant: 'destructive',
                      })
                }
              >
                Force live
              </Button>
              <Button size="sm" variant="outline" onClick={() => save(l.id, { closes_at: new Date().toISOString() })}>
                Force close now
              </Button>
            </div>

            {closed && (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 sm:grid-cols-4">
                {[
                  ['Hammer', usd(Number(l.current_price))],
                  ['Comp', l.market_price ? usd(Number(l.market_price)) : '—'],
                  ['Reserve', l.reserve_price ? usd(Number(l.reserve_price)) : 'none'],
                  ['Bids', String(l.bid_count)],
                ].map(([k, v]) => (
                  <div key={k} className="text-center">
                    <p className="font-mono text-lg tabular-nums">{v}</p>
                    <p className="vault-kicker text-[9px] text-muted-foreground">{k}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
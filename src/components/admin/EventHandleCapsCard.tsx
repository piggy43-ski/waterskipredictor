import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Gauge, Pencil, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface TournamentHandleRow {
  id: string;
  name: string;
  status: string;
  max_handle_tokens: number | null;
  current_handle_tokens: number;
  handle_warning_threshold: number;
}

function pct(current: number, max: number | null): number {
  if (!max || max <= 0) return 0;
  return Math.min(100, (current / max) * 100);
}

function bandFor(p: number): { color: string; label: string } {
  if (p >= 80) return { color: 'bg-destructive', label: 'red' };
  if (p >= 60) return { color: 'bg-yellow-500', label: 'amber' };
  return { color: 'bg-emerald-500', label: 'green' };
}

export function EventHandleCapsCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<TournamentHandleRow | null>(null);
  const [capInput, setCapInput] = useState<string>('');

  const { data: rows, isLoading } = useQuery({
    queryKey: ['admin', 'event-handle-caps'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, status, max_handle_tokens, current_handle_tokens, handle_warning_threshold')
        .in('status', ['upcoming', 'live', 'open'])
        .order('start_date', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as TournamentHandleRow[];
    },
    refetchInterval: 15_000,
  });

  const saveCap = useMutation({
    mutationFn: async ({ id, max }: { id: string; max: number | null }) => {
      const { error } = await supabase
        .from('tournaments')
        .update({ max_handle_tokens: max })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'event-handle-caps'] });
      toast.success('Cap updated');
      setEditing(null);
    },
    onError: (e: any) => toast.error(`Failed: ${e.message}`),
  });

  const openEdit = (row: TournamentHandleRow) => {
    setEditing(row);
    setCapInput(row.max_handle_tokens?.toString() ?? '');
  };

  const submit = () => {
    if (!editing) return;
    const trimmed = capInput.trim();
    const max = trimmed === '' ? null : parseInt(trimmed, 10);
    if (max !== null && (!Number.isFinite(max) || max < 0)) {
      toast.error('Enter a positive integer or leave blank for no cap');
      return;
    }
    saveCap.mutate({ id: editing.id, max });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          Event Handle Caps
        </CardTitle>
        <CardDescription>
          Per-event prediction handle (sum of stakes). New entries are rejected at the database when the cap is reached.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && rows && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No active or upcoming events.</p>
        )}
        {rows?.map((row) => {
          const max = row.max_handle_tokens;
          const cur = Number(row.current_handle_tokens || 0);
          const p = pct(cur, max);
          const band = bandFor(p);
          const uncapped = max == null;
          return (
            <div key={row.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{row.name}</div>
                  <div className="text-xs text-muted-foreground capitalize">{row.status}</div>
                </div>
                <div className="flex items-center gap-2">
                  {uncapped ? (
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      No cap
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={band.label === 'red' ? 'border-destructive text-destructive' : band.label === 'amber' ? 'border-yellow-500 text-yellow-600' : 'border-emerald-500 text-emerald-600'}>
                      {p.toFixed(1)}%
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit cap
                  </Button>
                </div>
              </div>
              {uncapped ? (
                <div className="text-xs text-muted-foreground">
                  Current handle: {cur.toLocaleString()} tokens — no cap configured.
                </div>
              ) : (
                <>
                  <Progress value={p} className="h-2" indicatorClassName={band.color} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{cur.toLocaleString()} tokens</span>
                    <span>{max!.toLocaleString()} cap (warn at {Math.round(row.handle_warning_threshold * 100)}%)</span>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit handle cap</DialogTitle>
            <DialogDescription>{editing?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cap-input">Max handle (tokens)</Label>
            <Input
              id="cap-input"
              type="number"
              min={0}
              step={1000}
              placeholder="Leave blank for no cap"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Current: {editing?.current_handle_tokens?.toLocaleString() ?? 0} tokens.
              Leaving blank removes the cap.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={submit} disabled={saveCap.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default EventHandleCapsCard;
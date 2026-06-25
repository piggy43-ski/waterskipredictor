import { useEffect, useState } from 'react';
import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LifeBuoy, Send, CheckCircle, Clock } from 'lucide-react';

interface Ticket {
  id: string;
  user_id: string | null;
  email: string | null;
  username: string | null;
  category: string;
  message: string;
  status: string;
  admin_response: string | null;
  page_url: string | null;
  created_at: string;
  responded_at: string | null;
}

const CATEGORIES = [
  { v: 'login', l: 'Login / account' },
  { v: 'prediction', l: 'Predictions' },
  { v: 'fantasy', l: 'Fantasy teams' },
  { v: 'wallet', l: 'Tokens / wallet' },
  { v: 'bug', l: 'Something is broken' },
  { v: 'other', l: 'Other' },
];

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    open: 'bg-amber-500/15 text-amber-500',
    in_progress: 'bg-blue-500/15 text-blue-500',
    resolved: 'bg-green-500/15 text-green-500',
    closed: 'bg-muted text-muted-foreground',
  };
  return <Badge variant="secondary" className={map[s] || ''}>{s.replace('_', ' ')}</Badge>;
}

export default function Support() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const { toast } = useToast();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [responses, setResponses] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [isAdmin, user?.id]);

  const submit = async () => {
    if (!message.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.from('support_tickets').insert({
      user_id: user?.id ?? null,
      email: user?.email ?? null,
      username: (user?.user_metadata as any)?.username ?? null,
      category,
      message: message.trim(),
      page_url: typeof window !== 'undefined' ? window.location.href : null,
      app_context: { ua: typeof navigator !== 'undefined' ? navigator.userAgent : null },
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Could not send', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Sent', description: "We got it — we'll get back to you in the app." });
    setMessage('');
    load();
  };

  const respond = async (t: Ticket, status: string) => {
    const resp = responses[t.id] ?? t.admin_response ?? '';
    const { error } = await supabase
      .from('support_tickets')
      .update({
        admin_response: resp || null,
        status,
        responded_by: user?.id ?? null,
        responded_at: resp ? new Date().toISOString() : t.responded_at,
      })
      .eq('id', t.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Updated' });
    load();
  };

  if (isAdmin) {
    const open = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress');
    const done = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
    const renderTicket = (t: Ticket) => (
      <Card key={t.id} className="mb-3">
        <CardContent className="pt-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              {t.username || t.email || 'Unknown'}
              <span className="text-muted-foreground"> · {t.category}</span>
            </div>
            <StatusBadge s={t.status} />
          </div>
          <div className="text-sm whitespace-pre-wrap">{t.message}</div>
          {t.page_url && <div className="text-xs text-muted-foreground break-all">{t.page_url}</div>}
          <Textarea
            placeholder="Write a reply to the user…"
            value={responses[t.id] ?? t.admin_response ?? ''}
            onChange={(e) => setResponses((r) => ({ ...r, [t.id]: e.target.value }))}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => respond(t, 'in_progress')}>In progress</Button>
            <Button size="sm" onClick={() => respond(t, 'resolved')}>Reply &amp; resolve</Button>
            <Button size="sm" variant="ghost" onClick={() => respond(t, 'closed')}>Close</Button>
          </div>
          <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
        </CardContent>
      </Card>
    );
    return (
      <AdminLayout>
        <div className="max-w-3xl mx-auto p-4">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <LifeBuoy className="w-6 h-6" /> Support Inbox
          </h1>
          <p className="text-muted-foreground text-sm mb-6">{open.length} open · {done.length} resolved</p>
          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <h2 className="font-semibold mb-2">Open</h2>
              {open.length ? open.map(renderTicket) : <p className="text-muted-foreground text-sm mb-6">Nothing open.</p>}
              <h2 className="font-semibold mt-6 mb-2">Resolved</h2>
              {done.length ? done.map(renderTicket) : <p className="text-muted-foreground text-sm">None yet.</p>}
            </>
          )}
        </div>
      </AdminLayout>
    );
  }

  return (
    <>
      <SEO title="Support" description="Get help with WaterSki Predictor" />
      <PageHeader title="Support" subtitle="Report a problem or ask a question" />
      <div className="max-w-xl mx-auto p-4 pb-28">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="w-5 h-5" /> Report a problem
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-1.5 block">What&apos;s it about?</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5 block">What&apos;s going on?</Label>
              <Textarea
                placeholder="Tell us what happened…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
              />
            </div>
            <Button onClick={submit} disabled={submitting || !message.trim()} className="w-full gap-2">
              <Send className="w-4 h-4" /> {submitting ? 'Sending…' : 'Send'}
            </Button>
          </CardContent>
        </Card>

        <h2 className="font-semibold mb-2">Your messages</h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="text-muted-foreground text-sm">No messages yet.</p>
        ) : (
          tickets.map((t) => (
            <Card key={t.id} className="mb-3">
              <CardContent className="pt-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{t.category}</span>
                  <StatusBadge s={t.status} />
                </div>
                <div className="text-sm whitespace-pre-wrap">{t.message}</div>
                {t.admin_response && (
                  <div className="mt-2 rounded-md bg-primary/5 border border-primary/20 p-3">
                    <div className="text-xs font-semibold text-primary mb-1 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> WaterSki Predictor
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{t.admin_response}</div>
                  </div>
                )}
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {new Date(t.created_at).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      <BottomNav />
    </>
  );
}

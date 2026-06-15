import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart } from 'recharts';
import { Users, UserPlus, Target, Repeat, Share2, CheckCircle2 } from 'lucide-react';

interface ProfileRow { id: string; created_at: string; onboarding_completed: boolean | null; referred_by_code_id: string | null; }
interface SlipRow { user_id: string; created_at: string; }

const DAY = 86400000;
function startOfWeek(d: Date) { const x = new Date(d); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day); x.setUTCHours(0,0,0,0); return x; }
function weekLabel(d: Date) { return `${d.getUTCMonth()+1}/${d.getUTCDate()}`; }

const Stat = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-2">
        <Icon className="w-4 h-4" /> {label}
      </div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </CardContent>
  </Card>
);

export default function Growth() {
  const { data: profiles = [], isLoading: pl } = useQuery({
    queryKey: ['growth-profiles'],
    queryFn: async (): Promise<ProfileRow[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, created_at, onboarding_completed, referred_by_code_id')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
  });

  const { data: slips = [], isLoading: sl } = useQuery({
    queryKey: ['growth-slips'],
    queryFn: async (): Promise<SlipRow[]> => {
      const { data, error } = await supabase
        .from('bet_slips')
        .select('user_id, created_at');
      if (error) throw error;
      return (data ?? []) as SlipRow[];
    },
  });

  const m = useMemo(() => {
    const now = Date.now();
    const total = profiles.length;
    const new7 = profiles.filter(p => now - new Date(p.created_at).getTime() <= 7*DAY).length;
    const new30 = profiles.filter(p => now - new Date(p.created_at).getTime() <= 30*DAY).length;
    const onboarded = profiles.filter(p => p.onboarding_completed).length;
    const referred = profiles.filter(p => p.referred_by_code_id).length;

    const activatedSet = new Set(slips.map(s => s.user_id));
    const activated = activatedSet.size;
    const active30Set = new Set(slips.filter(s => now - new Date(s.created_at).getTime() <= 30*DAY).map(s => s.user_id));
    const active30 = active30Set.size;

    // signups per week (last 12 weeks) + cumulative
    const buckets = new Map<number, number>();
    profiles.forEach(p => { const w = startOfWeek(new Date(p.created_at)).getTime(); buckets.set(w, (buckets.get(w) || 0) + 1); });
    const firstWeek = startOfWeek(new Date(now - 11*7*DAY)).getTime();
    const weeks: { week: string; signups: number; cumulative: number }[] = [];
    let runningBefore = profiles.filter(p => startOfWeek(new Date(p.created_at)).getTime() < firstWeek).length;
    for (let i = 0; i < 12; i++) {
      const w = firstWeek + i*7*DAY;
      const s = buckets.get(w) || 0;
      runningBefore += s;
      weeks.push({ week: weekLabel(new Date(w)), signups: s, cumulative: runningBefore });
    }

    return {
      total, new7, new30, onboarded, referred, activated, active30,
      activationPct: total ? Math.round((activated/total)*100) : 0,
      onboardPct: total ? Math.round((onboarded/total)*100) : 0,
      referredPct: total ? Math.round((referred/total)*100) : 0,
      weeks,
    };
  }, [profiles, slips]);

  const loading = pl || sl;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Growth</h1>
          <p className="text-muted-foreground text-sm">Acquisition, activation, retention &amp; referrals. Goal: 1,000 users.</p>
        </div>

        {loading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <Stat icon={Users} label="Total Users" value={String(m.total)} sub={`Goal 1,000 · ${Math.round((m.total/1000)*100)}%`} />
              <Stat icon={UserPlus} label="New (7d)" value={String(m.new7)} sub={`${m.new30} in 30d`} />
              <Stat icon={Target} label="Activation" value={`${m.activationPct}%`} sub={`${m.activated} made a pick`} />
              <Stat icon={Repeat} label="Active (30d)" value={String(m.active30)} sub="made a pick in 30d" />
              <Stat icon={CheckCircle2} label="Onboarded" value={`${m.onboardPct}%`} sub={`${m.onboarded} completed`} />
              <Stat icon={Share2} label="Referred" value={String(m.referred)} sub={`${m.referredPct}% of signups`} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Signups per week</CardTitle>
                <CardDescription>Last 12 weeks</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={m.weeks}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="signups" fill="#00e6f0" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cumulative users</CardTitle>
                <CardDescription>Trajectory toward 1,000</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={m.weeks}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="cumulative" stroke="#00e6f0" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground">
              Activation = users who placed ≥1 prediction. Referred = signups with a referral code attributed. Figures are live from the database.
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

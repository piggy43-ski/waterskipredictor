import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trophy, Users, FileCheck, Gift, ArrowRight, Mail, CheckCircle2, XCircle, Loader2 , DollarSign} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { applyDynamicStatus } from '@/utils/tournamentStatus';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { UnpublishedMarketsCard } from '@/components/admin/UnpublishedMarketsCard';
import { RealtimeActivityFeed } from '@/components/admin/RealtimeActivityFeed';

type EmailType = 'welcome' | 'entry_confirmation' | 'prediction_result' | 'prediction_result_lost' | 'redemption_receipt';

const EMAIL_TYPES: { value: EmailType; label: string }[] = [
  { value: 'welcome', label: 'Welcome Email' },
  { value: 'entry_confirmation', label: 'Entry Confirmation' },
  { value: 'prediction_result', label: 'Prediction Won' },
  { value: 'prediction_result_lost', label: 'Prediction Lost' },
  { value: 'redemption_receipt', label: 'Redemption Receipt' },
];

const TEST_DATA: Record<EmailType, Record<string, any>> = {
  welcome: {
    username: 'TestUser',
  },
  entry_confirmation: {
    username: 'TestUser',
    athleteName: 'Freddie Winter',
    tournamentName: 'World Championships 2025',
    discipline: 'Slalom',
    marketType: 'WINNER',
    stakedTokens: 500,
    potentialPayout: 1500,
    odds: 3.0,
  },
  prediction_result: {
    username: 'TestUser',
    athleteName: 'Freddie Winter',
    tournamentName: 'World Championships 2025',
    result: 'won',
    stakedTokens: 500,
    payoutTokens: 1500,
  },
  prediction_result_lost: {
    username: 'TestUser',
    athleteName: 'Freddie Winter',
    tournamentName: 'World Championships 2025',
    result: 'lost',
    stakedTokens: 500,
  },
  redemption_receipt: {
    username: 'TestUser',
    rewardName: 'Pro Coaching Session',
    rewardDescription: '1-hour session with a professional coach',
    tokensSpent: 5000,
    partnerName: 'Elite Water Sports',
    redemptionId: 'test-12345678',
  },
};

export default function AdminDashboard() {
  const [testEmail, setTestEmail] = useState('');
  const [emailType, setEmailType] = useState<EmailType>('welcome');
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null);

  const { data: finishedTournaments } = useQuery({
    queryKey: ['admin-finished-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .is('settled_at', null)
        .order('start_date', { ascending: false });
      
      if (error) throw error;
      return data.map(applyDynamicStatus).filter(t => t.status === 'finished');
    },
  });

  const { data: athletesCount } = useQuery({
    queryKey: ['admin-athletes-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('athletes')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: housePL } = useQuery({
    queryKey: ['admin-house-pl'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bet_slips')
        .select('status, total_stake_tokens, actual_payout_tokens');
      if (error) throw error;
      let collected = 0, paidNet = 0;
      (data || []).forEach((s: any) => {
        const st = (s.status || '').toUpperCase();
        const stake = s.total_stake_tokens || 0;
        const pay = s.actual_payout_tokens || 0;
        if (st === 'LOST') collected += stake;
        else if (st === 'WON') paidNet += (pay - stake);
      });
      return { pl: collected - paidNet, collected, paidNet };
    },
  });

  const { data: totalPredictions } = useQuery({
    queryKey: ['admin-total-predictions'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('predictions')
        .select('*', { count: 'exact', head: true });
      
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: pendingSlips } = useQuery({
    queryKey: ['admin-pending-slips'],
    queryFn: async () => {
      // Real obligations live at the SLIP level (money is paid per slip).
      // Child prediction rows can be stale 'PENDING' on already-settled slips
      // (parlay/display bug), so we count unsettled slips here, not predictions.
      const { count, error } = await supabase
        .from('bet_slips')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');
      
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: rewardsCount } = useQuery({
    queryKey: ['admin-rewards-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('rewards')
        .select('*', { count: 'exact', head: true })
        .eq('available', true);
      
      if (error) throw error;
      return count || 0;
    },
  });

  const handleSendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setIsSending(true);
    setLastResult(null);

    try {
      const actualEmailType = emailType === 'prediction_result_lost' ? 'prediction_result' : emailType;
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          type: actualEmailType,
          to: testEmail,
          data: TEST_DATA[emailType],
        },
      });

      if (error) throw error;

      if (data?.success) {
        setLastResult({
          success: true,
          message: data.skipped 
            ? 'Email skipped (user preferences)' 
            : `Email sent! ID: ${data.emailId}`,
        });
        toast.success('Test email sent successfully!');
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (error: any) {
      console.error('Test email failed:', error);
      setLastResult({
        success: false,
        message: error.message || 'Failed to send email',
      });
      toast.error(`Failed: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Welcome to the admin panel. Manage tournaments, athletes, and predictions.
          </p>
        </div>

        {housePL && (
          <Card className={housePL.pl >= 0 ? 'border-emerald-500/40' : 'border-red-500/40'}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
                <DollarSign className="w-4 h-4" /> House P&amp;L &middot; settled (tokens)
              </div>
              <div className={housePL.pl >= 0 ? 'text-4xl font-bold tabular-nums text-emerald-400' : 'text-4xl font-bold tabular-nums text-red-400'}>
                {housePL.pl >= 0 ? 'UP ' : 'DOWN '}{Math.abs(housePL.pl).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Collected from lost entries {housePL.collected.toLocaleString()} &middot; paid to winners net {housePL.paidNet.toLocaleString()}. Tokens are play credit — real cost is only rewards that get redeemed.{pendingSlips ? ` ${pendingSlips} slip(s) still awaiting settlement.` : ''}
              </p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Tournaments</CardTitle>
              <Trophy className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{finishedTournaments?.length || 0}</div>
              <p className="text-xs text-muted-foreground">Pending settlement</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Athletes</CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{athletesCount}</div>
              <p className="text-xs text-muted-foreground">Registered athletes</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Predictions</CardTitle>
              <FileCheck className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalPredictions}</div>
              <p className="text-xs text-muted-foreground">{pendingSlips} slips awaiting settlement</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Rewards</CardTitle>
              <Gift className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{rewardsCount}</div>
              <p className="text-xs text-muted-foreground">Available rewards</p>
            </CardContent>
          </Card>
        </div>

        {/* Real-time Activity Feed */}
        <RealtimeActivityFeed />

        {/* Email Test Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-primary" />
              <CardTitle>Email Test</CardTitle>
            </div>
            <CardDescription>
              Send test emails to verify Resend configuration. Check email_logs table for delivery status.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="test-email">Recipient Email</Label>
                <Input
                  id="test-email"
                  type="email"
                  placeholder="test@example.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-type">Email Type</Label>
                <Select value={emailType} onValueChange={(v) => setEmailType(v as EmailType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMAIL_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <Button onClick={handleSendTestEmail} disabled={isSending}>
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 mr-2" />
                    Send Test Email
                  </>
                )}
              </Button>
              
              {lastResult && (
                <div className={`flex items-center gap-2 text-sm ${lastResult.success ? 'text-emerald-600' : 'text-destructive'}`}>
                  {lastResult.success ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span>{lastResult.message}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Note: Emails require FROM_EMAIL and APP_URL secrets to be configured. 
              Domain must be verified in Resend for external delivery.
            </p>
          </CardContent>
        </Card>

        {/* Unpublished Markets Card */}
        <UnpublishedMarketsCard />

        {finishedTournaments && finishedTournaments.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Tournaments Pending Settlement</CardTitle>
                <Link to="/admin/tournament-settlement">
                  <Button variant="outline" size="sm">
                    Settle All
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {finishedTournaments.slice(0, 5).map((tournament) => (
                  <div key={tournament.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div>
                      <p className="font-medium">{tournament.name}</p>
                      <p className="text-sm text-muted-foreground">{tournament.location}</p>
                    </div>
                    <Link to="/admin/tournament-settlement">
                      <Button variant="ghost" size="sm">
                        Settle
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Use the sidebar to navigate to different management sections.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

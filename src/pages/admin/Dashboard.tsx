import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trophy, Users, FileCheck, Gift, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { applyDynamicStatus } from '@/utils/tournamentStatus';
import { Link } from 'react-router-dom';

export default function AdminDashboard() {
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

  const { data: pendingPredictions } = useQuery({
    queryKey: ['admin-pending-predictions'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('predictions')
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

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">Dashboard</h2>
          <p className="text-muted-foreground mt-1">
            Welcome to the admin panel. Manage tournaments, athletes, and predictions.
          </p>
        </div>

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
              <div className="text-2xl font-bold">{pendingPredictions}</div>
              <p className="text-xs text-muted-foreground">Pending settlement</p>
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

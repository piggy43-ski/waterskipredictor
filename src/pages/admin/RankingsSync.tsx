import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SyncResult {
  discipline: string;
  gender: string;
  created: number;
  updated: number;
  errors: string[];
}

interface SyncResponse {
  success: boolean;
  timestamp: string;
  totals: {
    created: number;
    updated: number;
    errors: number;
  };
  results: SyncResult[];
}

export default function RankingsSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResponse | null>(null);
  const { toast } = useToast();

  const triggerSync = async () => {
    setIsSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-iwwf-rankings', {
        body: { manual: true },
      });

      if (error) throw error;

      setLastSync(data as SyncResponse);
      
      if (data.success) {
        toast({
          title: 'Sync completed successfully',
          description: `Created ${data.totals.created}, updated ${data.totals.updated} athletes`,
        });
      } else {
        toast({
          title: 'Sync completed with errors',
          description: `${data.totals.errors} errors occurred`,
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Sync failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">IWWF Rankings Auto-Sync</h2>
          <p className="text-muted-foreground mt-1">
            Automatically fetch and update rankings from IWWF EMS
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sync Status</CardTitle>
            <CardDescription>
              Rankings sync automatically every day at 6:00 AM UTC. You can also trigger a manual sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                onClick={triggerSync}
                disabled={isSyncing}
                size="lg"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Trigger Manual Sync'}
              </Button>

              {lastSync && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  Last sync: {new Date(lastSync.timestamp).toLocaleString()}
                </div>
              )}
            </div>

            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                <strong>Automatic Schedule:</strong> Daily at 6:00 AM UTC<br />
                Processes all disciplines (Slalom, Trick, Jump) for both Men and Women
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {lastSync && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Last Sync Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-green-500/10 rounded-lg">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="text-2xl font-bold text-green-600">
                        {lastSync.totals.created}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">Athletes Created</p>
                  </div>

                  <div className="text-center p-4 bg-blue-500/10 rounded-lg">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <RefreshCw className="w-5 h-5 text-blue-600" />
                      <span className="text-2xl font-bold text-blue-600">
                        {lastSync.totals.updated}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">Athletes Updated</p>
                  </div>

                  <div className="text-center p-4 bg-red-500/10 rounded-lg">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <XCircle className="w-5 h-5 text-red-600" />
                      <span className="text-2xl font-bold text-red-600">
                        {lastSync.totals.errors}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">Errors</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detailed Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {lastSync.results.map((result, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border-b pb-3"
                    >
                      <div>
                        <p className="font-semibold capitalize">
                          {result.discipline} - {result.gender === 'male' ? 'Men' : 'Women'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Created: {result.created} • Updated: {result.updated}
                        </p>
                      </div>
                      <div>
                        {result.errors.length > 0 ? (
                          <span className="text-sm text-red-600">
                            {result.errors.length} errors
                          </span>
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {lastSync.results.some(r => r.errors.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Error Details</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {lastSync.results
                      .filter(r => r.errors.length > 0)
                      .map((result, idx) => (
                        <div key={idx}>
                          <p className="font-semibold text-sm mb-1 capitalize">
                            {result.discipline} - {result.gender === 'male' ? 'Men' : 'Women'}:
                          </p>
                          <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                            {result.errors.map((err, errIdx) => (
                              <li key={errIdx}>• {err}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>1. Automated Daily Sync:</strong> The system fetches the latest top 30 rankings
              from IWWF EMS every day at 6:00 AM UTC.
            </p>
            <p>
              <strong>2. Data Processing:</strong> For each discipline and gender category, the system:
            </p>
            <ul className="ml-6 space-y-1">
              <li>• Matches athletes by name and country to existing records</li>
              <li>• Creates new athlete profiles for previously unknown athletes</li>
              <li>• Updates current rank and points for all athletes</li>
              <li>• Stores historical ranking snapshots</li>
            </ul>
            <p>
              <strong>3. Performance Updates:</strong> After sync, athlete performance indices and
              fantasy prices are automatically recalculated based on the new rankings.
            </p>
            <p>
              <strong>Note:</strong> The scraper respects IWWF's servers with rate limiting between requests.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

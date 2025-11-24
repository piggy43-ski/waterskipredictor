import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

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
          <h2 className="text-3xl font-bold text-foreground">IWWF Rankings Management</h2>
          <p className="text-muted-foreground mt-1">
            Athlete database seeded with top 30 per discipline/gender
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Database Status</CardTitle>
            <CardDescription>
              Pre-seeded with ~180 real IWWF athletes across all categories
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 border rounded-lg bg-card">
                <div className="text-sm text-muted-foreground">Total Athletes</div>
                <div className="text-2xl font-bold text-foreground">~180</div>
                <div className="text-xs text-muted-foreground">Across all disciplines</div>
              </div>
              <div className="p-4 border rounded-lg bg-card">
                <div className="text-sm text-muted-foreground">Disciplines</div>
                <div className="text-2xl font-bold text-foreground">3</div>
                <div className="text-xs text-muted-foreground">Slalom, Trick, Jump</div>
              </div>
              <div className="p-4 border rounded-lg bg-card">
                <div className="text-sm text-muted-foreground">Categories</div>
                <div className="text-2xl font-bold text-foreground">2</div>
                <div className="text-xs text-muted-foreground">Men, Women</div>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Important Note</AlertTitle>
              <AlertDescription>
                The IWWF EMS website is a dynamic JavaScript application that cannot be scraped with simple tools.
                Use the Rankings Import tool to update rankings from CSV data exported from the IWWF EMS site.
              </AlertDescription>
            </Alert>

            <div className="flex items-center gap-4">
              <Button
                onClick={triggerSync}
                disabled={isSyncing}
                variant="outline"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Checking...' : 'Test Connection'}
              </Button>

              {lastSync && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4" />
                  Last check: {new Date(lastSync.timestamp).toLocaleString()}
                </div>
              )}
            </div>
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
            <CardTitle>Ranking Management Workflow</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="font-semibold mb-1">✅ Current Status:</p>
              <p className="text-muted-foreground">
                Database pre-seeded with ~180 real athletes (top 30 per discipline/gender) including:
                William Asher, Regina Jaquess, Martin Kolman, and other top-ranked athletes.
              </p>
            </div>
            
            <div>
              <p className="font-semibold mb-1">📊 To Update Rankings:</p>
              <ol className="text-muted-foreground space-y-1 ml-4">
                <li>1. Visit <a href="https://ems.iwwf.sport/RankingList/RankingListWaterski" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">IWWF EMS Rankings</a></li>
                <li>2. Select discipline and category</li>
                <li>3. Export or copy ranking data as CSV</li>
                <li>4. Use the Rankings Import tool to paste and import</li>
              </ol>
            </div>

            <div>
              <p className="font-semibold mb-1">🔄 Automatic Updates:</p>
              <p className="text-muted-foreground">
                Athletes are matched by name and country. Performance indices and fantasy prices
                are recalculated automatically after each ranking update.
              </p>
            </div>

            <div>
              <p className="font-semibold mb-1">⚙️ Manual Management:</p>
              <p className="text-muted-foreground">
                Visit the Athletes page to view, edit, and manage individual athlete profiles,
                rankings, and performance data.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

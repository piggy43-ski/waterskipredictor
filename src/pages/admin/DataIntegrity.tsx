import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAdminCheck } from "@/hooks/useAdminCheck";
import { AdminLayout } from "@/components/AdminLayout";
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, Wrench } from "lucide-react";

interface IntegrityReport {
  timestamp: string;
  total_markets_checked: number;
  total_selections_checked: number;
  duplicate_markets_found: number;
  duplicate_selections_found: number;
  status: 'CLEAN' | 'ISSUES_FOUND';
  duplicate_markets?: Array<{
    tournament_id: string;
    discipline: string;
    category: string;
    market_type: string;
    count: number;
  }>;
  duplicate_selections?: Array<{
    market_id: string;
    athlete_name: string;
    count: number;
  }>;
}

interface FixReport {
  timestamp: string;
  deleted_markets: number;
  deleted_selections: number;
  status: string;
  message: string;
}

export default function DataIntegrity() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: adminLoading } = useAdminCheck();
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [fixReport, setFixReport] = useState<FixReport | null>(null);

  if (adminLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  if (!isAdmin) {
    navigate('/');
    return null;
  }

  const runIntegrityCheck = async () => {
    setLoading(true);
    setReport(null);
    setFixReport(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('check-data-integrity', {
        body: { time: new Date().toISOString() }
      });

      if (error) throw error;

      setReport(data);
      
      if (data.status === 'CLEAN') {
        toast.success('✓ No data integrity issues found');
      } else {
        toast.warning(`Found ${data.duplicate_markets_found} duplicate markets and ${data.duplicate_selections_found} duplicate selections`);
      }
    } catch (error) {
      console.error('Integrity check error:', error);
      toast.error('Failed to run integrity check');
    } finally {
      setLoading(false);
    }
  };

  const fixDuplicates = async () => {
    if (!report || report.status === 'CLEAN') return;

    setFixing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('fix-data-duplicates', {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (error) throw error;

      setFixReport(data);
      toast.success(data.message);
      
      // Run integrity check again to confirm cleanup
      setTimeout(() => runIntegrityCheck(), 1000);
    } catch (error) {
      console.error('Fix duplicates error:', error);
      toast.error('Failed to fix duplicates');
    } finally {
      setFixing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Data Integrity</h1>
            <p className="text-muted-foreground mt-1">
              Monitor and fix duplicate markets and selections
            </p>
          </div>
          <Button onClick={runIntegrityCheck} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Run Check
              </>
            )}
          </Button>
        </div>

        <Alert>
          <AlertDescription>
            The data integrity checker automatically runs daily at 2 AM UTC. You can also manually trigger checks and fixes here.
          </AlertDescription>
        </Alert>

        {fixReport && (
          <Card className="border-green-500/50 bg-green-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Fix Applied Successfully
              </CardTitle>
              <CardDescription>{fixReport.message}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Markets Deleted</div>
                  <div className="text-2xl font-bold">{fixReport.deleted_markets}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Selections Deleted</div>
                  <div className="text-2xl font-bold">{fixReport.deleted_selections}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {report && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {report.status === 'CLEAN' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    )}
                    Integrity Check Report
                  </CardTitle>
                  <CardDescription>
                    Last run: {new Date(report.timestamp).toLocaleString()}
                  </CardDescription>
                </div>
                <Badge variant={report.status === 'CLEAN' ? 'default' : 'destructive'}>
                  {report.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Markets Checked</div>
                  <div className="text-2xl font-bold">{report.total_markets_checked}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Selections Checked</div>
                  <div className="text-2xl font-bold">{report.total_selections_checked}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Duplicate Markets</div>
                  <div className={`text-2xl font-bold ${report.duplicate_markets_found > 0 ? 'text-amber-500' : ''}`}>
                    {report.duplicate_markets_found}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Duplicate Selections</div>
                  <div className={`text-2xl font-bold ${report.duplicate_selections_found > 0 ? 'text-amber-500' : ''}`}>
                    {report.duplicate_selections_found}
                  </div>
                </div>
              </div>

              {report.status === 'ISSUES_FOUND' && (
                <>
                  {report.duplicate_markets && report.duplicate_markets.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Duplicate Markets Found
                      </h3>
                      <div className="space-y-2">
                        {report.duplicate_markets.slice(0, 5).map((dup, idx) => (
                          <div key={idx} className="p-3 border rounded-lg bg-muted/50">
                            <div className="text-sm">
                              <span className="font-medium">{dup.discipline}</span> • {dup.category} • {dup.market_type}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {dup.count} duplicate markets
                            </div>
                          </div>
                        ))}
                        {report.duplicate_markets.length > 5 && (
                          <div className="text-sm text-muted-foreground">
                            ...and {report.duplicate_markets.length - 5} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {report.duplicate_selections && report.duplicate_selections.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="font-semibold flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        Duplicate Selections Found
                      </h3>
                      <div className="space-y-2">
                        {report.duplicate_selections.slice(0, 5).map((dup, idx) => (
                          <div key={idx} className="p-3 border rounded-lg bg-muted/50">
                            <div className="text-sm font-medium">{dup.athlete_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {dup.count} duplicate selections
                            </div>
                          </div>
                        ))}
                        {report.duplicate_selections.length > 5 && (
                          <div className="text-sm text-muted-foreground">
                            ...and {report.duplicate_selections.length - 5} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  <Button 
                    onClick={fixDuplicates} 
                    disabled={fixing}
                    variant="destructive"
                    className="w-full"
                  >
                    {fixing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Fixing Duplicates...
                      </>
                    ) : (
                      <>
                        <Wrench className="mr-2 h-4 w-4" />
                        Fix All Duplicates
                      </>
                    )}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {!report && !loading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Report Available</h3>
              <p className="text-muted-foreground text-center mb-4">
                Run an integrity check to see the current status of your data
              </p>
              <Button onClick={runIntegrityCheck}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Run First Check
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}

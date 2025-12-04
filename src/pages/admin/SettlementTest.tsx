import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { AdminLayout } from '@/components/AdminLayout';

interface TestResults {
  tournament_id?: string;
  fantasy_pot_id?: string;
  fantasy_entry_id?: string;
  athletes?: string[];
  selections_created?: number;
  athlete_results_created?: number;
  single_bet_created?: boolean;
  parlay_bet_created?: boolean;
  fantasy_scoring?: Record<string, unknown>;
  predictions_settlement?: Record<string, unknown>;
  fantasy_pot_settlement?: Record<string, unknown>;
  initial_balance?: number;
  final_balance?: number;
  balance_change?: number;
  fantasy_scoring_error?: string;
  settlement_error?: string;
  fantasy_pot_settlement_error?: string;
}

const SettlementTest = () => {
  const { user } = useAuth();
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTest = async () => {
    if (!user) {
      toast({ title: 'Not authenticated', variant: 'destructive' });
      return;
    }

    setIsRunning(true);
    setResults(null);
    setError(null);

    try {
      toast({ title: 'Starting automated test...', description: 'This may take a few seconds' });

      const { data, error: fnError } = await supabase.functions.invoke('run-settlement-test', {
        body: { user_id: user.id }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (!data.success) {
        throw new Error(data.error || 'Test failed');
      }

      setResults(data.results);
      toast({ 
        title: 'Test completed successfully!', 
        description: `Balance change: ${data.results.balance_change >= 0 ? '+' : ''}${data.results.balance_change} tokens`
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      toast({ title: 'Test failed', description: message, variant: 'destructive' });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Settlement Test</h1>
          <p className="text-muted-foreground">
            Run an automated end-to-end test of the settlement system
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Automated Settlement Test</CardTitle>
            <CardDescription>
              This will create a test tournament, bets, fantasy entries, and run the full settlement flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
              <p className="font-medium">The test will:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Create a test tournament with all disciplines</li>
                <li>Add 6 athletes (3 male, 3 female) to the tournament</li>
                <li>Create markets and selections for each discipline</li>
                <li>Create a fantasy pot and enter you into it</li>
                <li>Place a single bet and a parlay bet</li>
                <li>Input athlete results</li>
                <li>Run fantasy scoring</li>
                <li>Settle all predictions</li>
                <li>Settle the fantasy pot</li>
              </ul>
            </div>

            <Button 
              onClick={runTest} 
              disabled={isRunning}
              size="lg"
              className="w-full"
            >
              {isRunning ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Test...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Automated Test
                </>
              )}
            </Button>

            {error && (
              <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-destructive">
                  <XCircle className="h-5 w-5" />
                  <span className="font-medium">Test Failed</span>
                </div>
                <p className="mt-2 text-sm">{error}</p>
              </div>
            )}

            {results && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Test Completed Successfully</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Created Resources</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tournament ID:</span>
                        <code className="text-xs bg-muted px-1 rounded">{results.tournament_id?.slice(0, 8)}...</code>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fantasy Pot:</span>
                        <code className="text-xs bg-muted px-1 rounded">{results.fantasy_pot_id?.slice(0, 8)}...</code>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Selections:</span>
                        <span>{results.selections_created}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Results:</span>
                        <span>{results.athlete_results_created}</span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Bets Created</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Single Bet:</span>
                        <Badge variant={results.single_bet_created ? 'default' : 'secondary'}>
                          {results.single_bet_created ? 'Created' : 'Failed'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Parlay Bet:</span>
                        <Badge variant={results.parlay_bet_created ? 'default' : 'secondary'}>
                          {results.parlay_bet_created ? 'Created' : 'Failed'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Settlement Status</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Fantasy Scoring:</span>
                        <Badge variant={results.fantasy_scoring_error ? 'destructive' : 'default'}>
                          {results.fantasy_scoring_error ? 'Error' : 'Done'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Predictions:</span>
                        <Badge variant={results.settlement_error ? 'destructive' : 'default'}>
                          {results.settlement_error ? 'Error' : 'Settled'}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">Fantasy Pot:</span>
                        <Badge variant={results.fantasy_pot_settlement_error ? 'destructive' : 'default'}>
                          {results.fantasy_pot_settlement_error ? 'Error' : 'Settled'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Wallet Balance</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Initial:</span>
                        <span>{results.initial_balance?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Final:</span>
                        <span>{results.final_balance?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>Change:</span>
                        <span className={results.balance_change && results.balance_change >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {results.balance_change && results.balance_change >= 0 ? '+' : ''}{results.balance_change?.toLocaleString()}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {results.athletes && (
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Athletes Used</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {results.athletes.map((name, i) => (
                          <Badge key={i} variant="outline">{name}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default SettlementTest;

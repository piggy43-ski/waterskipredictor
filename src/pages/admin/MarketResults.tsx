import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Upload, RefreshCw, Trophy, Calculator } from 'lucide-react';

interface ParsedResult {
  market_id: string;
  athlete_id: string;
  final_rank: number;
  athlete_name?: string;
  market_name?: string;
}

export default function MarketResults() {
  const queryClient = useQueryClient();
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [isMajor, setIsMajor] = useState(false);
  const [csvData, setCsvData] = useState('');
  const [parsedResults, setParsedResults] = useState<ParsedResult[]>([]);

  // Fetch tournaments
  const { data: tournaments } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, start_date')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch markets for selected tournament
  const { data: markets } = useQuery({
    queryKey: ['admin-markets', selectedTournament],
    queryFn: async () => {
      if (!selectedTournament) return [];
      const { data, error } = await supabase
        .from('markets')
        .select('id, name, discipline, category, market_type')
        .eq('tournament_id', selectedTournament);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTournament,
  });

  // Fetch existing results for the tournament
  const { data: existingResults } = useQuery({
    queryKey: ['admin-market-results', selectedTournament],
    queryFn: async () => {
      if (!selectedTournament || !markets) return [];
      const marketIds = markets.map(m => m.id);
      if (marketIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('market_results')
        .select(`
          id,
          market_id,
          athlete_id,
          final_rank,
          athletes(name)
        `)
        .in('market_id', marketIds)
        .order('final_rank', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTournament && !!markets,
  });

  // Fetch athletes for lookup
  const { data: athletes } = useQuery({
    queryKey: ['admin-athletes-lookup'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('athletes')
        .select('id, name');
      if (error) throw error;
      return data;
    },
  });

  // Save results mutation
  const saveResultsMutation = useMutation({
    mutationFn: async (results: ParsedResult[]) => {
      const { error } = await supabase
        .from('market_results')
        .upsert(
          results.map(r => ({
            market_id: r.market_id,
            athlete_id: r.athlete_id,
            final_rank: r.final_rank,
          })),
          { onConflict: 'market_id,athlete_id' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Results saved successfully');
      queryClient.invalidateQueries({ queryKey: ['admin-market-results'] });
      setParsedResults([]);
      setCsvData('');
    },
    onError: (error: any) => {
      toast.error('Failed to save results: ' + error.message);
    },
  });

  // Update ratings mutation
  const updateRatingsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('update-ratings-from-results', {
        body: { tournament_id: selectedTournament, is_major: isMajor },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Ratings updated: ${data.athletes_updated} athletes processed`);
      queryClient.invalidateQueries({ queryKey: ['admin-athletes'] });
    },
    onError: (error: any) => {
      toast.error('Failed to update ratings: ' + error.message);
    },
  });

  // Generate odds mutation
  const generateOddsMutation = useMutation({
    mutationFn: async () => {
      if (!markets) return { success: false, results: [] };
      
      const results = [];
      for (const market of markets) {
        try {
          const { data, error } = await supabase.functions.invoke('generate-market-odds', {
            body: { market_id: market.id },
          });
          if (error) throw error;
          results.push({ market_id: market.id, ...data });
        } catch (err: any) {
          results.push({ market_id: market.id, error: err.message });
        }
      }
      return { success: true, results };
    },
    onSuccess: (data) => {
      const successCount = data.results.filter((r: any) => r.success).length;
      toast.success(`Generated multipliers for ${successCount}/${data.results.length} contests`);
      queryClient.invalidateQueries({ queryKey: ['admin-market-odds'] });
    },
    onError: (error: any) => {
      toast.error('Failed to generate multipliers: ' + error.message);
    },
  });

  // Parse CSV data
  const handleParseCSV = () => {
    if (!csvData.trim()) {
      toast.error('Please paste CSV data');
      return;
    }

    const lines = csvData.trim().split('\n');
    const parsed: ParsedResult[] = [];

    for (let i = 1; i < lines.length; i++) { // Skip header
      const cols = lines[i].split(',').map(c => c.trim());
      if (cols.length >= 3) {
        const marketId = cols[0];
        const athleteId = cols[1];
        const finalRank = parseInt(cols[2]);

        if (marketId && athleteId && !isNaN(finalRank)) {
          const athlete = athletes?.find(a => a.id === athleteId);
          const market = markets?.find(m => m.id === marketId);

          parsed.push({
            market_id: marketId,
            athlete_id: athleteId,
            final_rank: finalRank,
            athlete_name: athlete?.name || 'Unknown',
            market_name: market?.name || 'Unknown',
          });
        }
      }
    }

    if (parsed.length === 0) {
      toast.error('No valid results found in CSV');
      return;
    }

    setParsedResults(parsed);
    toast.success(`Parsed ${parsed.length} results`);
  };

  const getMarketName = (marketId: string) => {
    const market = markets?.find(m => m.id === marketId);
    return market?.name || 'Unknown';
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contest Results Import</h1>
          <p className="text-muted-foreground">Import final results to update athlete ratings and generate multipliers</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Tournament</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Select value={selectedTournament} onValueChange={setSelectedTournament}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tournament" />
                  </SelectTrigger>
                  <SelectContent>
                    {tournaments?.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} ({t.start_date})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="is-major"
                  checked={isMajor}
                  onCheckedChange={setIsMajor}
                />
                <Label htmlFor="is-major">World Championship (1.25x rating impact)</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedTournament && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Import Results CSV</CardTitle>
                <CardDescription>
                  Format: market_id, athlete_id, final_rank (with header row)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <textarea
                  className="w-full h-32 p-3 border rounded-md bg-background text-foreground font-mono text-sm"
                  placeholder={`market_id,athlete_id,final_rank\n${markets?.[0]?.id || 'uuid'},athlete-uuid,1\n...`}
                  value={csvData}
                  onChange={(e) => setCsvData(e.target.value)}
                />
                <Button onClick={handleParseCSV}>
                  <Upload className="w-4 h-4 mr-2" />
                  Parse CSV
                </Button>

                {parsedResults.length > 0 && (
                  <div className="space-y-4">
                    <h4 className="font-medium">Preview ({parsedResults.length} results)</h4>
                    <div className="max-h-64 overflow-auto border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Contest</TableHead>
                            <TableHead>Athlete</TableHead>
                            <TableHead>Rank</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsedResults.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs">{r.market_name}</TableCell>
                              <TableCell>{r.athlete_name}</TableCell>
                              <TableCell>
                                <Badge variant={r.final_rank <= 3 ? 'default' : 'outline'}>
                                  #{r.final_rank}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button 
                      onClick={() => saveResultsMutation.mutate(parsedResults)}
                      disabled={saveResultsMutation.isPending}
                    >
                      {saveResultsMutation.isPending ? 'Saving...' : 'Save Results'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {existingResults && existingResults.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5" />
                    Current Results ({existingResults.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-64 overflow-auto border rounded-md">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Contest</TableHead>
                          <TableHead>Athlete</TableHead>
                          <TableHead>Rank</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {existingResults.map((r: any) => (
                          <TableRow key={r.id}>
                            <TableCell>{getMarketName(r.market_id)}</TableCell>
                            <TableCell>{r.athletes?.name}</TableCell>
                            <TableCell>
                              <Badge variant={r.final_rank <= 3 ? 'default' : 'outline'}>
                                #{r.final_rank}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
                <CardDescription>Update athlete ratings based on results, then generate new multipliers</CardDescription>
              </CardHeader>
              <CardContent className="flex gap-4">
                <Button
                  onClick={() => updateRatingsMutation.mutate()}
                  disabled={updateRatingsMutation.isPending || !existingResults?.length}
                  variant="secondary"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${updateRatingsMutation.isPending ? 'animate-spin' : ''}`} />
                  Update Ratings
                </Button>
                <Button
                  onClick={() => generateOddsMutation.mutate()}
                  disabled={generateOddsMutation.isPending || !markets?.length}
                >
                  <Calculator className={`w-4 h-4 mr-2 ${generateOddsMutation.isPending ? 'animate-spin' : ''}`} />
                  Generate All Multipliers
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AdminLayout>
  );
}

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Search, Save, RefreshCw, CheckCircle, AlertTriangle, Trophy, Loader2 } from 'lucide-react';
import type { Discipline } from '@/types';

interface QuickResultsEditorProps {
  tournamentId: string;
  onResultUpdated?: () => void;
}

interface EditableResult {
  id: string;
  athlete_id: string;
  athlete_name: string;
  discipline: string;
  gender: string;
  round_type: string;
  final_overall_rank: number | null;
  raw_score: number | null;
  score_display: string | null;
  stood_both_passes: boolean;
  missed_first_pass: boolean;
  missed_gate: boolean;
  no_score: boolean;
  made_finals: boolean;
  isDirty: boolean;
}

export function QuickResultsEditor({ tournamentId, onResultUpdated }: QuickResultsEditorProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDiscipline, setFilterDiscipline] = useState<string>('all');
  const [filterGender, setFilterGender] = useState<string>('all');
  const [editedResults, setEditedResults] = useState<Record<string, EditableResult>>({});
  const [autoRescore, setAutoRescore] = useState(true);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing results
  const { data: results, isLoading } = useQuery({
    queryKey: ['quick-edit-results', tournamentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournament_results')
        .select('*, athlete:athletes(name)')
        .eq('tournament_id', tournamentId)
        .order('discipline')
        .order('gender')
        .order('round_type')
        .order('final_overall_rank', { nullsFirst: false });

      if (error) throw error;
      return data;
    },
    enabled: !!tournamentId,
  });

  // Filter results
  const filteredResults = useMemo(() => {
    if (!results) return [];
    
    return results.filter(r => {
      const matchesSearch = !searchTerm || 
        (r.athlete as any)?.name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDiscipline = filterDiscipline === 'all' || r.discipline === filterDiscipline;
      const matchesGender = filterGender === 'all' || r.gender === filterGender;
      return matchesSearch && matchesDiscipline && matchesGender;
    });
  }, [results, searchTerm, filterDiscipline, filterGender]);

  // Get or create editable state for a result
  const getEditableResult = (result: any): EditableResult => {
    if (editedResults[result.id]) {
      return editedResults[result.id];
    }
    return {
      id: result.id,
      athlete_id: result.athlete_id,
      athlete_name: (result.athlete as any)?.name || 'Unknown',
      discipline: result.discipline,
      gender: result.gender,
      round_type: result.round_type,
      final_overall_rank: result.final_overall_rank,
      raw_score: result.raw_score,
      score_display: result.score_display,
      stood_both_passes: result.stood_both_passes ?? true,
      missed_first_pass: result.missed_first_pass ?? false,
      missed_gate: result.missed_gate ?? false,
      no_score: result.no_score ?? false,
      made_finals: result.made_finals ?? false,
      isDirty: false,
    };
  };

  // Update a field
  const updateField = (resultId: string, field: keyof EditableResult, value: any) => {
    const result = results?.find(r => r.id === resultId);
    if (!result) return;

    const current = getEditableResult(result);
    setEditedResults(prev => ({
      ...prev,
      [resultId]: {
        ...current,
        [field]: value,
        isDirty: true,
      },
    }));
  };

  // Save single result mutation
  const saveSingleMutation = useMutation({
    mutationFn: async (resultId: string) => {
      const edited = editedResults[resultId];
      if (!edited) throw new Error('No changes to save');

      const { error } = await supabase
        .from('tournament_results')
        .update({
          final_overall_rank: edited.final_overall_rank,
          stood_both_passes: edited.stood_both_passes,
          missed_first_pass: edited.missed_first_pass,
          missed_gate: edited.missed_gate,
          no_score: edited.no_score,
          made_finals: edited.made_finals,
        })
        .eq('id', resultId);

      if (error) throw error;

      // Auto-rescore if enabled
      if (autoRescore) {
        const { data: rescoreData, error: rescoreError } = await supabase.functions.invoke('score-fantasy', {
          body: { tournament_id: tournamentId, rescore: true }
        });
        if (rescoreError) throw rescoreError;
        return { rescoreData };
      }
      return {};
    },
    onSuccess: (data, resultId) => {
      // Clear the dirty flag
      setEditedResults(prev => {
        const newState = { ...prev };
        delete newState[resultId];
        return newState;
      });
      
      queryClient.invalidateQueries({ queryKey: ['quick-edit-results', tournamentId] });
      
      toast({
        title: 'Result Updated',
        description: autoRescore && data.rescoreData 
          ? `Saved and rescored ${data.rescoreData.entries_scored || 0} fantasy entries`
          : 'Result saved successfully',
      });
      
      onResultUpdated?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Save Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Save all dirty results
  const saveAllMutation = useMutation({
    mutationFn: async () => {
      const dirtyResults = Object.values(editedResults).filter(r => r.isDirty);
      if (dirtyResults.length === 0) throw new Error('No changes to save');

      for (const edited of dirtyResults) {
        const { error } = await supabase
          .from('tournament_results')
          .update({
            final_overall_rank: edited.final_overall_rank,
            stood_both_passes: edited.stood_both_passes,
            missed_first_pass: edited.missed_first_pass,
            missed_gate: edited.missed_gate,
            no_score: edited.no_score,
            made_finals: edited.made_finals,
          })
          .eq('id', edited.id);

        if (error) throw error;
      }

      // Rescore once after all saves
      if (autoRescore) {
        const { data: rescoreData, error: rescoreError } = await supabase.functions.invoke('score-fantasy', {
          body: { tournament_id: tournamentId, rescore: true }
        });
        if (rescoreError) throw rescoreError;
        return { count: dirtyResults.length, rescoreData };
      }
      return { count: dirtyResults.length };
    },
    onSuccess: (data) => {
      setEditedResults({});
      queryClient.invalidateQueries({ queryKey: ['quick-edit-results', tournamentId] });
      
      toast({
        title: 'All Changes Saved',
        description: autoRescore && data.rescoreData 
          ? `Updated ${data.count} results. Rescored ${data.rescoreData.entries_scored || 0} fantasy entries`
          : `Updated ${data.count} results`,
      });
      
      onResultUpdated?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Save Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const dirtyCount = Object.values(editedResults).filter(r => r.isDirty).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading results...
      </div>
    );
  }

  if (!results?.length) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No results found for this tournament. Enter results first before using the quick editor.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search athlete..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={filterDiscipline} onValueChange={setFilterDiscipline}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Discipline" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Disciplines</SelectItem>
            <SelectItem value="slalom">Slalom</SelectItem>
            <SelectItem value="trick">Trick</SelectItem>
            <SelectItem value="jump">Jump</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterGender} onValueChange={setFilterGender}>
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="male">Men</SelectItem>
            <SelectItem value="female">Women</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Auto-rescore toggle */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          <Label htmlFor="auto-rescore" className="cursor-pointer">
            Auto-rescore fantasy after changes
          </Label>
        </div>
        <Switch
          id="auto-rescore"
          checked={autoRescore}
          onCheckedChange={setAutoRescore}
        />
      </div>

      {/* Dirty changes indicator */}
      {dirtyCount > 0 && (
        <Alert className="bg-warning/10 border-warning/30">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <AlertDescription className="flex items-center justify-between">
            <span>You have {dirtyCount} unsaved change{dirtyCount > 1 ? 's' : ''}</span>
            <Button 
              size="sm" 
              onClick={() => saveAllMutation.mutate()}
              disabled={saveAllMutation.isPending}
            >
              {saveAllMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save All
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Results table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                <th className="text-left p-3 font-medium">Athlete</th>
                <th className="text-left p-3 font-medium">Discipline</th>
                <th className="text-left p-3 font-medium">Round</th>
                <th className="text-center p-3 font-medium">Rank</th>
                <th className="text-center p-3 font-medium">Score</th>
                <th className="text-center p-3 font-medium">Stood Both</th>
                <th className="text-center p-3 font-medium">Flags</th>
                <th className="text-center p-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredResults.map((result) => {
                const editable = getEditableResult(result);
                const isDirty = editedResults[result.id]?.isDirty;
                
                return (
                  <tr 
                    key={result.id} 
                    className={`hover:bg-muted/30 ${isDirty ? 'bg-warning/5' : ''}`}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={result.gender === 'female' ? 'bg-pink-500/20' : 'bg-blue-500/20'}
                        >
                          {result.gender === 'female' ? '♀' : '♂'}
                        </Badge>
                        <span className="font-medium">{(result.athlete as any)?.name}</span>
                        {isDirty && <Badge variant="secondary" className="text-xs">Edited</Badge>}
                      </div>
                    </td>
                    <td className="p-3 capitalize">{result.discipline}</td>
                    <td className="p-3 capitalize">{result.round_type}</td>
                    <td className="p-3 text-center">
                      {editable.final_overall_rank ? (
                        <Badge variant="outline">#{editable.final_overall_rank}</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {result.score_display || result.raw_score || '-'}
                    </td>
                    <td className="p-3 text-center">
                      {result.discipline === 'trick' ? (
                        <Switch
                          checked={editable.stood_both_passes}
                          onCheckedChange={(v) => updateField(result.id, 'stood_both_passes', v)}
                        />
                      ) : (
                        <span className="text-muted-foreground">n/a</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-center gap-1">
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            id={`no-score-${result.id}`}
                            checked={editable.no_score}
                            onChange={(e) => updateField(result.id, 'no_score', e.target.checked)}
                            className="w-3 h-3"
                          />
                          <label htmlFor={`no-score-${result.id}`} className="text-xs cursor-pointer">DNS/DNF</label>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            id={`missed-fp-${result.id}`}
                            checked={editable.missed_first_pass}
                            onChange={(e) => updateField(result.id, 'missed_first_pass', e.target.checked)}
                            className="w-3 h-3"
                          />
                          <label htmlFor={`missed-fp-${result.id}`} className="text-xs cursor-pointer">1st Pass</label>
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            id={`missed-gate-${result.id}`}
                            checked={editable.missed_gate}
                            onChange={(e) => updateField(result.id, 'missed_gate', e.target.checked)}
                            className="w-3 h-3"
                          />
                          <label htmlFor={`missed-gate-${result.id}`} className="text-xs cursor-pointer">Gate</label>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      {isDirty && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => saveSingleMutation.mutate(result.id)}
                          disabled={saveSingleMutation.isPending}
                        >
                          {saveSingleMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Save className="w-4 h-4" />
                          )}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Showing {filteredResults.length} of {results?.length} results
      </div>
    </div>
  );
}

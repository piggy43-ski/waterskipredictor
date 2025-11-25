import { useState } from 'react';
import { AdminLayout } from '@/components/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Upload, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Discipline = 'slalom' | 'trick' | 'jump';
type Gender = 'male' | 'female';

export default function RankingsImport() {
  const [discipline, setDiscipline] = useState<Discipline>('slalom');
  const [gender, setGender] = useState<Gender>('male');
  const [csvData, setCsvData] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const { toast } = useToast();

  const processCSV = async () => {
    setIsProcessing(true);
    setResults(null);

    try {
      const lines = csvData.split('\n').filter(line => line.trim());
      let created = 0;
      let updated = 0;
      const errors: string[] = [];

      for (const line of lines.slice(0, 30)) { // Top 30 only
        const parts = line.split(/[,\t]/).map(p => p.trim());
        
        if (parts.length < 3) {
          errors.push(`Skipped invalid line: ${line}`);
          continue;
        }

        const rank = parseInt(parts[0]);
        const name = parts[1];
        const country = parts[2];
        const points = parseFloat(parts[3] || '0');

        if (!rank || !name || !country) {
          errors.push(`Missing data in line: ${line}`);
          continue;
        }

        // Try to find existing athlete - improved matching
        const nameTrimmed = name.trim();
        const countryTrimmed = country.trim();
        
        const { data: existingAthletes } = await supabase
          .from('athletes')
          .select('*')
          .or(`name.ilike.%${nameTrimmed}%,country.ilike.%${countryTrimmed}%`)
          .limit(10);

        // Find best match
        let bestMatch = existingAthletes?.find(a => 
          a.name.toLowerCase().trim() === nameTrimmed.toLowerCase() &&
          (a.country.toLowerCase().trim() === countryTrimmed.toLowerCase() || 
           a.country_code?.toLowerCase().trim() === countryTrimmed.toLowerCase())
        );

        let athleteId: string;

        if (bestMatch) {
          // Update existing athlete
          athleteId = bestMatch.id;
          
          const updateData: any = {
            [`current_rank_${discipline}`]: rank,
            [`current_points_${discipline}`]: points,
            full_name: nameTrimmed,
            country_code: countryTrimmed,
          };

          // Add discipline if not already in disciplines array
          const currentDisciplines = bestMatch.disciplines || [];
          if (!currentDisciplines.includes(discipline)) {
            updateData.disciplines = [...currentDisciplines, discipline];
          }

          await supabase
            .from('athletes')
            .update(updateData)
            .eq('id', athleteId);

          updated++;
        } else {
          // Create new athlete
          const { data: newAthlete, error } = await supabase
            .from('athletes')
            .insert({
              name: nameTrimmed,
              full_name: nameTrimmed,
              country: countryTrimmed,
              country_code: countryTrimmed,
              gender,
              disciplines: [discipline],
              federation: 'IWWF',
              year_of_birth: 1990,
              [`current_rank_${discipline}`]: rank,
              [`current_points_${discipline}`]: points,
            })
            .select()
            .single();

          if (error || !newAthlete) {
            errors.push(`Failed to create athlete ${nameTrimmed}: ${error?.message}`);
            continue;
          }

          athleteId = newAthlete.id;
          created++;
        }

        // Insert ranking snapshot
        await supabase
          .from('athlete_rankings')
          .upsert({
            athlete_id: athleteId,
            discipline,
            gender,
            rank,
            points,
            list_date: new Date().toISOString().split('T')[0],
            source: 'IWWF_EMS',
          }, {
            onConflict: 'athlete_id,discipline,gender,list_date'
          });
      }

      setResults({ created, updated, errors });
      toast({
        title: 'Import complete',
        description: `Created ${created}, updated ${updated} athletes`,
      });
    } catch (error: any) {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-foreground">IWWF Rankings Import</h2>
          <p className="text-muted-foreground mt-1">Import top 30 athletes from IWWF EMS ranking list</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Import Settings</CardTitle>
            <CardDescription>
              Select discipline and gender, then paste ranking data (CSV or tab-separated)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="discipline">Discipline</Label>
                <Select value={discipline} onValueChange={(v) => setDiscipline(v as Discipline)}>
                  <SelectTrigger id="discipline">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slalom">Slalom</SelectItem>
                    <SelectItem value="trick">Trick</SelectItem>
                    <SelectItem value="jump">Jump</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="gender">Gender</Label>
                <Select value={gender} onValueChange={(v) => setGender(v as Gender)}>
                  <SelectTrigger id="gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Open Men</SelectItem>
                    <SelectItem value="female">Open Women</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="csvData">Ranking Data</Label>
              <Textarea
                id="csvData"
                placeholder="Paste data: Rank, Name, Country, Points (one per line)&#10;Example:&#10;1, John Smith, USA, 1234.5&#10;2, Jane Doe, CAN, 1200.0"
                value={csvData}
                onChange={(e) => setCsvData(e.target.value)}
                rows={12}
                className="font-mono text-sm"
              />
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Expected format: Rank, Name, Country, Points (comma or tab separated). Only the top 30 entries will be processed.
              </AlertDescription>
            </Alert>

            <Button 
              onClick={processCSV} 
              disabled={!csvData.trim() || isProcessing}
              className="w-full"
            >
              <Upload className="w-4 h-4 mr-2" />
              {isProcessing ? 'Processing...' : 'Import Rankings'}
            </Button>

            {results && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Import Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">
                    <span className="font-semibold text-green-600">Created:</span> {results.created} athletes
                  </p>
                  <p className="text-sm">
                    <span className="font-semibold text-blue-600">Updated:</span> {results.updated} athletes
                  </p>
                  {results.errors.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-destructive mb-2">Errors:</p>
                      <ul className="text-xs space-y-1 text-muted-foreground">
                        {results.errors.map((err, i) => (
                          <li key={i}>• {err}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

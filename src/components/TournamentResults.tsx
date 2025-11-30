import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal } from 'lucide-react';

interface AthleteResult {
  id: string;
  athlete_id: string;
  position: number | null;
  score_raw: number | null;
  discipline: string;
  gender: string;
  athlete?: {
    name: string;
    country: string;
  };
}

interface TournamentResultsProps {
  results: AthleteResult[];
  disciplines: Array<'slalom' | 'trick' | 'jump'>;
}

export const TournamentResults = ({ results, disciplines }: TournamentResultsProps) => {
  const getResultsByDisciplineAndGender = (discipline: string, gender: string) => {
    return results
      .filter(r => r.discipline === discipline && r.gender === gender)
      .sort((a, b) => (a.position || 999) - (b.position || 999));
  };

  const getPositionIcon = (position: number | null) => {
    if (position === 1) return <Trophy className="w-5 h-5 text-yellow-500" />;
    if (position === 2) return <Medal className="w-5 h-5 text-gray-400" />;
    if (position === 3) return <Medal className="w-5 h-5 text-amber-600" />;
    return null;
  };

  const getPositionBadge = (position: number | null) => {
    if (!position) return null;
    
    let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
    if (position === 1) variant = "default";
    else if (position <= 3) variant = "secondary";
    
    return (
      <Badge variant={variant} className="font-bold">
        #{position}
      </Badge>
    );
  };

  const formatScore = (score: number | null, discipline: string) => {
    if (score === null) return '-';
    
    if (discipline === 'slalom') {
      // Score is already normalized, display as is
      return score.toString();
    }
    
    return score.toFixed(2);
  };

  if (results.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Final Results</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            Results not yet available
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Final Results
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={disciplines[0]} className="w-full">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: `repeat(${disciplines.length}, 1fr)` }}>
            {disciplines.map(disc => (
              <TabsTrigger key={disc} value={disc} className="capitalize">
                {disc}
              </TabsTrigger>
            ))}
          </TabsList>

          {disciplines.map(discipline => (
            <TabsContent key={discipline} value={discipline} className="space-y-4">
              {/* Men's Results */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground">Men</h3>
                <div className="space-y-2">
                  {getResultsByDisciplineAndGender(discipline, 'male').map((result, idx) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center gap-2 min-w-[60px]">
                          {getPositionIcon(result.position)}
                          {getPositionBadge(result.position)}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{result.athlete?.name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{result.athlete?.country}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">
                          {formatScore(result.score_raw, discipline)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {discipline === 'slalom' && 'buoys@rope'}
                          {discipline === 'trick' && 'points'}
                          {discipline === 'jump' && 'meters'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {getResultsByDisciplineAndGender(discipline, 'male').length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No results</p>
                  )}
                </div>
              </div>

              {/* Women's Results */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm text-muted-foreground">Women</h3>
                <div className="space-y-2">
                  {getResultsByDisciplineAndGender(discipline, 'female').map((result, idx) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center gap-2 min-w-[60px]">
                          {getPositionIcon(result.position)}
                          {getPositionBadge(result.position)}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">{result.athlete?.name || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{result.athlete?.country}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">
                          {formatScore(result.score_raw, discipline)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {discipline === 'slalom' && 'buoys@rope'}
                          {discipline === 'trick' && 'points'}
                          {discipline === 'jump' && 'meters'}
                        </p>
                      </div>
                    </div>
                  ))}
                  {getResultsByDisciplineAndGender(discipline, 'female').length === 0 && (
                    <p className="text-center text-muted-foreground py-4">No results</p>
                  )}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
};

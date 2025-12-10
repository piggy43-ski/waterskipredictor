import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, Trophy, Target } from 'lucide-react';
import type { PointsBreakdownData } from './FantasyPointsBreakdown';

interface LeaderAthlete {
  athlete_id: string;
  discipline: string;
  points_earned: number;
  athlete: {
    name: string;
  };
}

interface LeaderData {
  id: string;
  team_name: string | null;
  total_points: number;
  rank: number | null;
  user_id: string;
  profile?: {
    username: string;
  };
  athletes: LeaderAthlete[];
}

interface UserAthleteWithScoring {
  discipline: string;
  points_earned: number;
  scoringEvent?: {
    breakdown: PointsBreakdownData;
  };
}

interface LeaderComparisonProps {
  userEntry: {
    total_points: number;
    rank: number | null;
    user_id: string;
  };
  leaderData: LeaderData | null;
  userAthletes: UserAthleteWithScoring[];
  isLeader: boolean;
}

export const LeaderComparison = ({ 
  userEntry, 
  leaderData, 
  userAthletes,
  isLeader 
}: LeaderComparisonProps) => {
  if (isLeader || !leaderData) {
    return (
      <Card className="p-4 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border-yellow-500/30">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <span className="font-semibold text-yellow-600 dark:text-yellow-400">
            You're in the lead!
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Keep your position by maintaining your roster
        </p>
      </Card>
    );
  }

  const pointsGap = leaderData.total_points - userEntry.total_points;
  const progressPercentage = leaderData.total_points > 0 
    ? Math.max(0, Math.min(100, (userEntry.total_points / leaderData.total_points) * 100))
    : 50;

  // Calculate points by discipline for user
  const userPointsByDiscipline: Record<string, number> = {
    slalom: 0,
    trick: 0,
    jump: 0,
  };
  userAthletes.forEach(a => {
    if (userPointsByDiscipline[a.discipline] !== undefined) {
      userPointsByDiscipline[a.discipline] += a.points_earned;
    }
  });

  // Calculate points by discipline for leader
  const leaderPointsByDiscipline: Record<string, number> = {
    slalom: 0,
    trick: 0,
    jump: 0,
  };
  leaderData.athletes.forEach(a => {
    if (leaderPointsByDiscipline[a.discipline] !== undefined) {
      leaderPointsByDiscipline[a.discipline] += a.points_earned;
    }
  });

  // Find leader's top performer
  const leaderTopPerformer = leaderData.athletes.reduce((best, current) => {
    if (!best || current.points_earned > best.points_earned) {
      return current;
    }
    return best;
  }, null as LeaderAthlete | null);

  const disciplines = ['slalom', 'trick', 'jump'] as const;

  return (
    <Card className="p-4">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Target className="w-4 h-4 text-primary" />
        vs Leader ({leaderData.profile?.username || 'Unknown'})
      </h3>

      {/* Overall comparison */}
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Your Score</span>
          <span className="font-bold">{userEntry.total_points}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Leader</span>
          <span className="font-bold text-primary">{leaderData.total_points}</span>
        </div>
        
        <Progress value={progressPercentage} className="h-2" />
        
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Gap to leader</span>
          <span className={`font-semibold ${pointsGap > 0 ? 'text-destructive' : 'text-emerald-500'}`}>
            {pointsGap > 0 ? `-${pointsGap}` : `+${Math.abs(pointsGap)}`} pts
          </span>
        </div>
      </div>

      {/* Discipline breakdown */}
      <div className="border-t border-border pt-3">
        <p className="text-xs font-medium text-muted-foreground mb-2">By Discipline</p>
        <div className="space-y-2">
          {disciplines.map(disc => {
            const userPts = userPointsByDiscipline[disc];
            const leaderPts = leaderPointsByDiscipline[disc];
            const diff = userPts - leaderPts;
            
            return (
              <div key={disc} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 flex-1">
                  <span className="capitalize w-16">{disc}</span>
                  <div className="flex items-center gap-1">
                    {diff > 0 ? (
                      <TrendingUp className="w-3 h-3 text-emerald-500" />
                    ) : diff < 0 ? (
                      <TrendingDown className="w-3 h-3 text-destructive" />
                    ) : (
                      <Minus className="w-3 h-3 text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="w-12 text-right">{userPts >= 0 ? `+${userPts}` : userPts}</span>
                  <span className="text-muted-foreground w-12 text-right">{leaderPts >= 0 ? `+${leaderPts}` : leaderPts}</span>
                  <span className={`w-12 text-right font-medium ${
                    diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'
                  }`}>
                    ({diff >= 0 ? `+${diff}` : diff})
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Leader's top performer */}
      {leaderTopPerformer && leaderTopPerformer.points_earned > 0 && (
        <div className="border-t border-border pt-3 mt-3">
          <p className="text-xs text-muted-foreground">
            Leader's best pick: <span className="font-medium text-foreground">{leaderTopPerformer.athlete.name}</span>
            <span className="text-muted-foreground"> ({leaderTopPerformer.discipline})</span>
            <span className="text-emerald-500 ml-1">+{leaderTopPerformer.points_earned} pts</span>
          </p>
        </div>
      )}
    </Card>
  );
};

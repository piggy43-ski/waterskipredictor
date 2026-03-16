import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminLayout } from '@/components/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trophy, TrendingUp, TrendingDown, Users, DollarSign, Copy, Target, Loader2, BarChart3, Zap } from 'lucide-react';

const TournamentRecap = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Fetch settled tournaments for selector
  const { data: settledTournaments, isLoading: tournamentsLoading } = useQuery({
    queryKey: ['settled-tournaments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tournaments')
        .select('id, name, start_date, end_date, settled_at, location')
        .not('settled_at', 'is', null)
        .order('settled_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const selectedId = id || settledTournaments?.[0]?.id;
  const selectedTournament = settledTournaments?.find(t => t.id === selectedId);

  // Fetch bet slips for selected tournament
  const { data: betSlips, isLoading: betsLoading } = useQuery({
    queryKey: ['recap-bets', selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bet_slips')
        .select(`
          id, status, type, total_stake_tokens, potential_payout_tokens, actual_payout_tokens,
          total_odds_decimal, leg_count, user_id, athlete_id, market_id,
          profiles!bet_slips_user_id_fkey(username),
          athletes!bet_slips_athlete_id_fkey(name),
          markets!bet_slips_market_id_fkey(discipline, category, market_type)
        `)
        .eq('tournament_id', selectedId!)
        .in('status', ['WON', 'LOST', 'VOID', 'PENDING']);
      if (error) throw error;
      return data;
    },
  });

  // Fetch fantasy data for selected tournament
  const { data: fantasyData, isLoading: fantasyLoading } = useQuery({
    queryKey: ['recap-fantasy', selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data: pots, error: potErr } = await supabase
        .from('fantasy_pots')
        .select('id, name')
        .eq('tournament_id', selectedId!);
      if (potErr) throw potErr;
      if (!pots?.length) return null;

      const potIds = pots.map(p => p.id);
      const { data: entries, error: entErr } = await supabase
        .from('fantasy_entries')
        .select(`
          id, user_id, total_points, rank, team_name, pot_id,
          fantasy_entry_athletes(athlete_id, points_earned, athletes!fantasy_entry_athletes_athlete_id_fkey(name))
        `)
        .in('pot_id', potIds)
        .order('total_points', { ascending: false });
      if (entErr) throw entErr;

      // Get usernames
      const userIds = [...new Set(entries?.map(e => e.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);
      const profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p.username]));

      return { pots, entries: entries || [], profileMap };
    },
  });

  // Compute all stats
  const stats = useMemo(() => {
    if (!betSlips) return null;

    const settled = betSlips.filter(b => b.status === 'WON' || b.status === 'LOST');
    const totalEntries = settled.length;
    const uniqueUsers = new Set(settled.map(b => b.user_id)).size;
    const totalWagered = settled.reduce((s, b) => s + b.total_stake_tokens, 0);
    const totalPaidOut = settled.filter(b => b.status === 'WON').reduce((s, b) => s + (b.actual_payout_tokens || 0), 0);
    const winCount = settled.filter(b => b.status === 'WON').length;
    const winRate = totalEntries > 0 ? winCount / totalEntries : 0;
    const housePL = totalWagered - totalPaidOut;

    // Top winners: group by user, sum net profit
    const userProfits: Record<string, { username: string; netProfit: number; bestBet: typeof settled[0] | null }> = {};
    settled.forEach(b => {
      const uid = b.user_id;
      const username = (b.profiles as any)?.username || 'Unknown';
      const payout = b.status === 'WON' ? (b.actual_payout_tokens || 0) : 0;
      const net = payout - b.total_stake_tokens;
      if (!userProfits[uid]) userProfits[uid] = { username, netProfit: 0, bestBet: null };
      userProfits[uid].netProfit += net;
      if (!userProfits[uid].bestBet || net > ((userProfits[uid].bestBet.actual_payout_tokens || 0) - userProfits[uid].bestBet.total_stake_tokens)) {
        userProfits[uid].bestBet = b;
      }
    });
    const topWinners = Object.values(userProfits)
      .filter(u => u.netProfit > 0)
      .sort((a, b) => b.netProfit - a.netProfit)
      .slice(0, 5);

    // Biggest misses: largest potential payouts that lost
    const biggestMisses = settled
      .filter(b => b.status === 'LOST')
      .sort((a, b) => b.potential_payout_tokens - a.potential_payout_tokens)
      .slice(0, 5);

    // Trap picks: most-backed athletes with 0 wins
    const athleteBacking: Record<string, { name: string; totalStaked: number; entries: number; wins: number }> = {};
    settled.forEach(b => {
      const aid = b.athlete_id;
      if (!aid) return;
      const name = (b.athletes as any)?.name || 'Unknown';
      if (!athleteBacking[aid]) athleteBacking[aid] = { name, totalStaked: 0, entries: 0, wins: 0 };
      athleteBacking[aid].totalStaked += b.total_stake_tokens;
      athleteBacking[aid].entries += 1;
      if (b.status === 'WON') athleteBacking[aid].wins += 1;
    });
    const trapPicks = Object.values(athleteBacking)
      .filter(a => a.wins === 0 && a.entries >= 2)
      .sort((a, b) => b.totalStaked - a.totalStaked)
      .slice(0, 5);

    // Top performing athletes (highest win rate, min 2 entries)
    const topAthletes = Object.values(athleteBacking)
      .filter(a => a.entries >= 2 && a.wins > 0)
      .map(a => ({ ...a, winRate: a.wins / a.entries }))
      .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)
      .slice(0, 5);

    // Discipline breakdown
    const discBreakdown: Record<string, { wagered: number; wins: number; total: number }> = {};
    settled.forEach(b => {
      const market = b.markets as any;
      if (!market) return;
      const key = `${market.discipline} ${market.category} ${market.market_type}`;
      if (!discBreakdown[key]) discBreakdown[key] = { wagered: 0, wins: 0, total: 0 };
      discBreakdown[key].wagered += b.total_stake_tokens;
      discBreakdown[key].total += 1;
      if (b.status === 'WON') discBreakdown[key].wins += 1;
    });

    // Parlay stats
    const parlays = settled.filter(b => b.type === 'parlay');
    const parlayWins = parlays.filter(b => b.status === 'WON').length;

    return {
      totalEntries, uniqueUsers, totalWagered, totalPaidOut, housePL, winRate, winCount,
      topWinners, biggestMisses, trapPicks, topAthletes, discBreakdown,
      parlayCount: parlays.length, parlayWins,
    };
  }, [betSlips]);

  // Fantasy stats
  const fantasyStats = useMemo(() => {
    if (!fantasyData?.entries?.length) return null;
    const sorted = [...fantasyData.entries].sort((a, b) => Number(b.total_points) - Number(a.total_points));
    const winner = sorted[0];
    const runnerUp = sorted[1];

    // Find MVP and bust across all entries
    const athletePoints: Record<string, { name: string; totalPoints: number; count: number }> = {};
    fantasyData.entries.forEach(entry => {
      (entry.fantasy_entry_athletes as any[])?.forEach((fea: any) => {
        const name = fea.athletes?.name || 'Unknown';
        const aid = fea.athlete_id;
        if (!athletePoints[aid]) athletePoints[aid] = { name, totalPoints: 0, count: 0 };
        athletePoints[aid].totalPoints += Number(fea.points_earned);
        athletePoints[aid].count += 1;
      });
    });
    const athleteList = Object.values(athletePoints).sort((a, b) => b.totalPoints - a.totalPoints);
    const mvp = athleteList[0];
    const bust = athleteList[athleteList.length - 1];

    return {
      potName: fantasyData.pots[0]?.name,
      totalEntrants: sorted.length,
      winner: { username: fantasyData.profileMap[winner.user_id] || 'Unknown', points: Number(winner.total_points) },
      runnerUp: runnerUp ? { username: fantasyData.profileMap[runnerUp.user_id] || 'Unknown', points: Number(runnerUp.total_points) } : null,
      mvp,
      bust,
    };
  }, [fantasyData]);

  const generateRecapText = () => {
    if (!stats || !selectedTournament) return '';
    const lines: string[] = [];
    lines.push(`🏆 ${selectedTournament.name} — Prediction Recap`);
    lines.push('');
    lines.push(`📊 By The Numbers`);
    lines.push(`• ${stats.totalEntries} entries from ${stats.uniqueUsers} users`);
    lines.push(`• ${stats.totalWagered.toLocaleString()} tokens wagered → ${stats.totalPaidOut.toLocaleString()} paid out`);
    lines.push(`• ${(stats.winRate * 100).toFixed(0)}% win rate (${stats.winCount}/${stats.totalEntries})`);
    if (stats.parlayCount > 0) {
      lines.push(`• ${stats.parlayWins}/${stats.parlayCount} parlays hit`);
    }
    lines.push('');

    if (stats.topWinners.length > 0) {
      lines.push(`💰 Top Winners`);
      stats.topWinners.forEach((w, i) => {
        const bet = w.bestBet;
        const athlete = (bet?.athletes as any)?.name || '';
        lines.push(`${i + 1}. ${w.username} — +${w.netProfit.toLocaleString()} tokens${athlete ? ` (${athlete})` : ''}`);
      });
      lines.push('');
    }

    if (stats.biggestMisses.length > 0) {
      lines.push(`😤 Biggest Near-Misses`);
      stats.biggestMisses.forEach(b => {
        const user = (b.profiles as any)?.username || 'Unknown';
        const athlete = (b.athletes as any)?.name || '';
        lines.push(`• ${user} missed ${b.potential_payout_tokens.toLocaleString()} payout (${b.total_odds_decimal}x on ${athlete})`);
      });
      lines.push('');
    }

    if (stats.trapPicks.length > 0) {
      lines.push(`🪤 Trap Picks (Most Backed, 0 Wins)`);
      stats.trapPicks.forEach(t => {
        lines.push(`• ${t.name} — ${t.totalStaked.toLocaleString()} tokens across ${t.entries} entries`);
      });
      lines.push('');
    }

    if (fantasyStats) {
      lines.push(`🎯 Fantasy: ${fantasyStats.potName}`);
      lines.push(`• Winner: ${fantasyStats.winner.username} (${fantasyStats.winner.points} pts)`);
      if (fantasyStats.runnerUp) {
        lines.push(`• Runner-up: ${fantasyStats.runnerUp.username} (${fantasyStats.runnerUp.points} pts)`);
      }
      if (fantasyStats.mvp) lines.push(`• MVP: ${fantasyStats.mvp.name} (${fantasyStats.mvp.totalPoints} pts total)`);
      if (fantasyStats.bust) lines.push(`• Bust: ${fantasyStats.bust.name} (${fantasyStats.bust.totalPoints} pts total)`);
    }

    return lines.join('\n');
  };

  const handleCopy = () => {
    const text = generateRecapText();
    navigator.clipboard.writeText(text);
    toast.success('Recap copied to clipboard!');
  };

  const isLoading = tournamentsLoading || betsLoading || fantasyLoading;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">Tournament Recap</h2>
            <p className="text-muted-foreground text-sm">Auto-generated post-settlement analytics</p>
          </div>
          <div className="flex items-center gap-3">
            <Select
              value={selectedId || ''}
              onValueChange={(val) => navigate(`/admin/tournament-recap/${val}`)}
            >
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select tournament..." />
              </SelectTrigger>
              <SelectContent>
                {settledTournaments?.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleCopy} disabled={!stats} variant="outline" size="sm">
              <Copy className="h-4 w-4 mr-1" /> Copy Recap
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && !selectedId && (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No settled tournaments found.</CardContent></Card>
        )}

        {stats && selectedTournament && (
          <>
            {/* Tournament header */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" />
                  {selectedTournament.name}
                </CardTitle>
                <CardDescription>
                  {selectedTournament.location} • {selectedTournament.start_date} → {selectedTournament.end_date}
                  {selectedTournament.settled_at && ` • Settled ${new Date(selectedTournament.settled_at).toLocaleDateString()}`}
                </CardDescription>
              </CardHeader>
            </Card>

            {/* Volume Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Entries', value: stats.totalEntries, icon: Target },
                { label: 'Users', value: stats.uniqueUsers, icon: Users },
                { label: 'Wagered', value: stats.totalWagered.toLocaleString(), icon: DollarSign },
                { label: 'Paid Out', value: stats.totalPaidOut.toLocaleString(), icon: TrendingUp },
                { label: 'House P/L', value: `${stats.housePL >= 0 ? '+' : ''}${stats.housePL.toLocaleString()}`, icon: BarChart3 },
                { label: 'Win Rate', value: `${(stats.winRate * 100).toFixed(0)}%`, icon: Zap },
              ].map(s => (
                <Card key={s.label}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                      <s.icon className="h-3.5 w-3.5" />
                      {s.label}
                    </div>
                    <div className="text-lg font-bold text-foreground">{s.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Winners */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" /> Top Winners
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.topWinners.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No winners yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Best Pick</TableHead>
                          <TableHead className="text-right">Net Profit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.topWinners.map((w, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{w.username}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {(w.bestBet?.athletes as any)?.name || '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">
                                +{w.netProfit.toLocaleString()}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Biggest Misses */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-destructive" /> Biggest Misses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.biggestMisses.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No misses recorded.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Athlete</TableHead>
                          <TableHead className="text-right">Missed Payout</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.biggestMisses.map((b, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{(b.profiles as any)?.username || '—'}</TableCell>
                            <TableCell className="text-muted-foreground text-sm">{(b.athletes as any)?.name || '—'}</TableCell>
                            <TableCell className="text-right">
                              <Badge variant="outline" className="text-destructive border-destructive/30">
                                {b.potential_payout_tokens.toLocaleString()} ({b.total_odds_decimal}x)
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Trap Picks */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    🪤 Trap Picks
                  </CardTitle>
                  <CardDescription>Most-backed athletes with 0 wins</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats.trapPicks.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No trap picks this tournament.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Athlete</TableHead>
                          <TableHead className="text-right">Staked</TableHead>
                          <TableHead className="text-right">Entries</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.trapPicks.map((t, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{t.name}</TableCell>
                            <TableCell className="text-right">{t.totalStaked.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{t.entries}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Top Performing Athletes */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-primary" /> Top Performing Athletes
                  </CardTitle>
                  <CardDescription>Highest win rate among backed athletes</CardDescription>
                </CardHeader>
                <CardContent>
                  {stats.topAthletes.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No data yet.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Athlete</TableHead>
                          <TableHead className="text-right">Win Rate</TableHead>
                          <TableHead className="text-right">W/L</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stats.topAthletes.map((a, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{a.name}</TableCell>
                            <TableCell className="text-right">{(a.winRate * 100).toFixed(0)}%</TableCell>
                            <TableCell className="text-right text-muted-foreground">{a.wins}/{a.entries}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Discipline Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" /> Discipline Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Market</TableHead>
                        <TableHead className="text-right">Wagered</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(stats.discBreakdown)
                        .sort(([, a], [, b]) => b.wagered - a.wagered)
                        .map(([key, d]) => (
                          <TableRow key={key}>
                            <TableCell className="text-sm">{key}</TableCell>
                            <TableCell className="text-right">{d.wagered.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{d.total > 0 ? `${((d.wins / d.total) * 100).toFixed(0)}%` : '—'}</TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Parlay Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4 text-warning" /> Parlay Stats
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {stats.parlayCount === 0 ? (
                    <p className="text-muted-foreground text-sm">No parlays placed this tournament.</p>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Parlays</span>
                        <span className="font-bold">{stats.parlayCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Parlays Hit</span>
                        <span className="font-bold">{stats.parlayWins}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Hit Rate</span>
                        <span className="font-bold">
                          {((stats.parlayWins / stats.parlayCount) * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Fantasy Results */}
            {fantasyStats && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    🎯 Fantasy: {fantasyStats.potName}
                  </CardTitle>
                  <CardDescription>{fantasyStats.totalEntrants} entrants</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">🥇 Winner</div>
                      <div className="font-bold">{fantasyStats.winner.username}</div>
                      <div className="text-sm text-muted-foreground">{fantasyStats.winner.points} pts</div>
                    </div>
                    {fantasyStats.runnerUp && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">🥈 Runner-Up</div>
                        <div className="font-bold">{fantasyStats.runnerUp.username}</div>
                        <div className="text-sm text-muted-foreground">{fantasyStats.runnerUp.points} pts</div>
                      </div>
                    )}
                    {fantasyStats.mvp && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">⭐ MVP Athlete</div>
                        <div className="font-bold">{fantasyStats.mvp.name}</div>
                        <div className="text-sm text-muted-foreground">{fantasyStats.mvp.totalPoints} pts across {fantasyStats.mvp.count} teams</div>
                      </div>
                    )}
                    {fantasyStats.bust && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">💀 Bust</div>
                        <div className="font-bold">{fantasyStats.bust.name}</div>
                        <div className="text-sm text-muted-foreground">{fantasyStats.bust.totalPoints} pts across {fantasyStats.bust.count} teams</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default TournamentRecap;

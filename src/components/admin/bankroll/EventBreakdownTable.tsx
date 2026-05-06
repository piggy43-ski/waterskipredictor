import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatUSD, tokensToUSD } from '@/utils/tokenConversion';
import { cn } from '@/lib/utils';

export interface EventRow {
  tournament_id: string;
  name: string;
  status: string;
  settled: boolean;
  entries: number;
  stake_tokens: number;
  open_payout_tokens: number;
  actual_payout_tokens: number;
}

export const EventBreakdownTable = ({ rows }: { rows: EventRow[] }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Per-event breakdown (last 90 days)</CardTitle>
    </CardHeader>
    <CardContent>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tournament entries in the last 90 days.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tournament</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Entries</TableHead>
              <TableHead className="text-right">Stake</TableHead>
              <TableHead className="text-right">Payout</TableHead>
              <TableHead className="text-right">House P/L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const payoutTokens = r.settled ? r.actual_payout_tokens : r.open_payout_tokens;
              const pl = r.settled
                ? r.stake_tokens - r.actual_payout_tokens
                : r.stake_tokens - r.open_payout_tokens;
              const plUsd = tokensToUSD(pl);
              return (
                <TableRow key={r.tournament_id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant={r.settled ? 'secondary' : 'outline'}>
                      {r.settled ? 'settled' : r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.entries}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatUSD(tokensToUSD(r.stake_tokens))}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUSD(tokensToUSD(payoutTokens))}
                    {!r.settled && <span className="text-xs text-muted-foreground ml-1">(open)</span>}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums font-medium',
                      pl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                    )}
                  >
                    {pl >= 0 ? '+' : ''}{formatUSD(plUsd)}
                    {!r.settled && <span className="text-xs text-muted-foreground ml-1">(exp.)</span>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);
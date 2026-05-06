import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { formatUSD, tokensToUSD } from '@/utils/tokenConversion';

export interface UserConcentrationRow {
  user_id: string;
  earned_tokens: number;
  pct_of_total: number;
}

export const UserConcentrationTable = ({
  rows,
  totalEarned,
}: {
  rows: UserConcentrationRow[];
  totalEarned: number;
}) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-lg">Top 10 user concentration</CardTitle>
      <p className="text-xs text-muted-foreground">
        Total earned across all users: {totalEarned.toLocaleString()} tokens (
        {formatUSD(tokensToUSD(totalEarned))})
      </p>
    </CardHeader>
    <CardContent>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No users with earned tokens yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="text-right">Earned tokens</TableHead>
              <TableHead className="text-right">USD</TableHead>
              <TableHead className="text-right">% of total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.user_id}>
                <TableCell className="font-mono text-xs">{r.user_id.slice(0, 8)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.earned_tokens.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatUSD(tokensToUSD(r.earned_tokens))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.pct_of_total.toFixed(1)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatUSD, tokensToUSD } from '@/utils/tokenConversion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export interface MarketExposureRow {
  key: string;
  market_name: string;
  market_type: string | null;
  tournament_name: string;
  open_tickets: number;
  open_payout_tokens: number;
}

export const MarketExposureTable = ({ rows }: { rows: MarketExposureRow[] }) => {
  const top8 = rows.slice(0, 8).map((r) => ({
    name: r.market_name.length > 22 ? r.market_name.slice(0, 22) + '…' : r.market_name,
    usd: Number(tokensToUSD(r.open_payout_tokens).toFixed(2)),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Open exposure by market</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open PENDING slips.</p>
        ) : (
          <>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top8} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                  <Bar dataKey="usd" fill="hsl(var(--primary))" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead>Tournament</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Open tickets</TableHead>
                  <TableHead className="text-right">Potential payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">{r.market_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.tournament_name}</TableCell>
                    <TableCell>
                      {r.market_type && <Badge variant="outline">{r.market_type}</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.open_tickets}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUSD(tokensToUSD(r.open_payout_tokens))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
};
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowDownLeft, ArrowUpRight, Clock, Coins } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface Transfer {
  id: string;
  athlete_id: string;
  discipline: string;
  transfer_type: 'buy' | 'sell';
  price: number;
  created_at: string;
  transfer_window?: string;
  athlete?: {
    name: string;
    country_code?: string | null;
  };
  tournament?: {
    name: string;
  };
}

interface TransferHistoryProps {
  entryId: string;
}

export function TransferHistory({ entryId }: TransferHistoryProps) {
  const { data: transfers, isLoading } = useQuery({
    queryKey: ['transfer-history', entryId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fantasy_transfers')
        .select(`
          *,
          athlete:athletes(name, country_code),
          tournament:tournaments!transfer_window(name)
        `)
        .eq('entry_id', entryId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Transfer[];
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-center text-muted-foreground">
          Loading transfer history...
        </CardContent>
      </Card>
    );
  }

  if (!transfers || transfers.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Transfer History
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center text-muted-foreground py-6">
          <p>No transfers yet</p>
          <p className="text-xs mt-1">Your buy and sell history will appear here</p>
        </CardContent>
      </Card>
    );
  }

  // Group by transfer window
  const groupedByWindow = transfers.reduce((acc, t) => {
    const windowName = t.tournament?.name || 'Initial Team';
    if (!acc[windowName]) acc[windowName] = [];
    acc[windowName].push(t);
    return acc;
  }, {} as Record<string, Transfer[]>);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Transfer History ({transfers.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <ScrollArea className="h-[300px]">
          {Object.entries(groupedByWindow).map(([windowName, windowTransfers]) => (
            <div key={windowName} className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2 sticky top-0 bg-background py-1">
                {windowName}
              </p>
              <div className="space-y-2">
                {windowTransfers.map(t => (
                  <div 
                    key={t.id} 
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      t.transfer_type === 'buy' 
                        ? 'bg-emerald-500/10 border border-emerald-500/20' 
                        : 'bg-destructive/10 border border-destructive/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {t.transfer_type === 'buy' ? (
                        <ArrowDownLeft className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-destructive" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{t.athlete?.name || 'Unknown'}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs py-0">
                            {t.discipline}
                          </Badge>
                          <span>•</span>
                          <span>{format(new Date(t.created_at), 'MMM d, HH:mm')}</span>
                        </div>
                      </div>
                    </div>
                    <div className={`text-right font-medium ${
                      t.transfer_type === 'buy' ? 'text-destructive' : 'text-emerald-500'
                    }`}>
                      <div className="flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        {t.transfer_type === 'buy' ? '-' : '+'}{t.price.toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

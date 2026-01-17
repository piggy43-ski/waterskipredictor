import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminLayout } from '@/components/AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronDown, ChevronRight, Search, Shield, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

// Action type categories for filtering
const ACTION_TYPES = [
  'MARKET_CREATED',
  'MARKET_STATUS_CHANGED',
  'MARKET_LOCKED',
  'RESULTS_FINALIZED',
  'ODDS_GENERATED',
  'MULTIPLIER_UPDATED',
  'IMPLIED_SUM_NORMALIZED',
  'ODDS_FROZEN',
  'ENTRY_PLACED',
  'ENTRY_VOIDED',
  'ENTRY_REFUNDED',
  'PREDICTION_SETTLED',
  'PARLAY_SETTLED',
  'BETSLIP_SETTLED',
  'REWARDS_CALCULATED',
  'REWARDS_ISSUED',
  'REWARD_REDEEMED',
  'REWARD_REVERSED',
  'FANTASY_POT_SETTLED',
  'FANTASY_SCORED',
  'TOKENS_PURCHASED',
  'ADMIN_OVERRIDE',
  'EMERGENCY_BLOCK',
  'LIABILITY_CAP_TRIGGERED',
  'AUTO_SHORTENING_APPLIED',
] as const;

const ENTITY_TYPES = [
  'market',
  'prediction',
  'betslip',
  'reward',
  'fantasy_pot',
  'fantasy_entry',
  'user',
  'athlete',
  'tournament',
  'token_transaction',
  'bet_validation',
] as const;

interface AuditLog {
  id: string;
  actor_type: 'admin' | 'system';
  actor_id: string | null;
  action_type: string;
  entity_type: string;
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const getActionBadgeVariant = (actionType: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (actionType.includes('SETTLED') || actionType.includes('ISSUED')) return 'default';
  if (actionType.includes('VOIDED') || actionType.includes('REVERSED') || actionType.includes('LOST')) return 'destructive';
  if (actionType.includes('GENERATED') || actionType.includes('CREATED')) return 'secondary';
  return 'outline';
};

export default function AuditLogs() {
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('');
  const [entityIdSearch, setEntityIdSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: logs, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['audit-logs', actionTypeFilter, entityTypeFilter, entityIdSearch],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (actionTypeFilter) {
        query = query.eq('action_type', actionTypeFilter);
      }
      if (entityTypeFilter) {
        query = query.eq('entity_type', entityTypeFilter);
      }
      if (entityIdSearch) {
        query = query.ilike('entity_id', `%${entityIdSearch}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLog[];
    },
  });

  // Fetch admin profiles for actor names
  const { data: profiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, email');
      if (error) throw error;
      return data;
    },
  });

  const getActorName = (actorType: string, actorId: string | null) => {
    if (actorType === 'system') return 'System';
    if (!actorId) return 'Unknown';
    const profile = profiles?.find(p => p.id === actorId);
    return profile?.username || profile?.email || actorId.slice(0, 8);
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const clearFilters = () => {
    setActionTypeFilter('');
    setEntityTypeFilter('');
    setEntityIdSearch('');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Audit Logs</h1>
            <p className="text-sm text-muted-foreground">
              Immutable record of all system actions — read-only, cannot be modified or deleted
            </p>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Filters</CardTitle>
            <CardDescription>Filter logs by action type, entity, or search by entity ID</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Action Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Action Types</SelectItem>
                  {ACTION_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Entity Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Entity Types</SelectItem>
                  {ENTITY_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search entity ID..."
                  value={entityIdSearch}
                  onChange={(e) => setEntityIdSearch(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={clearFilters} className="flex-1">
                  Clear
                </Button>
                <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardContent className="p-0">
            <ScrollArea className="h-[600px]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead className="w-40">Timestamp</TableHead>
                    <TableHead className="w-24">Actor</TableHead>
                    <TableHead className="w-48">Action</TableHead>
                    <TableHead>Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        Loading audit logs...
                      </TableCell>
                    </TableRow>
                  ) : !logs || logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No audit logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map(log => (
                      <Collapsible key={log.id} open={expandedRows.has(log.id)} onOpenChange={() => toggleRow(log.id)} asChild>
                        <>
                          <CollapsibleTrigger asChild>
                            <TableRow className="cursor-pointer hover:bg-muted/50">
                              <TableCell className="p-2">
                                {expandedRows.has(log.id) ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </TableCell>
                              <TableCell className="text-xs font-mono text-muted-foreground">
                                {format(new Date(log.created_at), 'MMM d, HH:mm:ss')}
                              </TableCell>
                              <TableCell>
                                <Badge variant={log.actor_type === 'admin' ? 'default' : 'secondary'} className="text-xs">
                                  {getActorName(log.actor_type, log.actor_id)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant={getActionBadgeVariant(log.action_type)} className="font-mono text-xs">
                                  {log.action_type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                <span className="text-muted-foreground">{log.entity_type}:</span>{' '}
                                <span className="font-mono text-xs">{log.entity_id.slice(0, 12)}...</span>
                              </TableCell>
                            </TableRow>
                          </CollapsibleTrigger>
                          <CollapsibleContent asChild>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableCell colSpan={5} className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <h4 className="text-sm font-medium mb-2 text-muted-foreground">Before State</h4>
                                    <pre className="text-xs bg-background p-3 rounded-md overflow-auto max-h-48 border">
                                      {log.before_state 
                                        ? JSON.stringify(log.before_state, null, 2)
                                        : 'null'}
                                    </pre>
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-medium mb-2 text-muted-foreground">After State</h4>
                                    <pre className="text-xs bg-background p-3 rounded-md overflow-auto max-h-48 border">
                                      {log.after_state 
                                        ? JSON.stringify(log.after_state, null, 2)
                                        : 'null'}
                                    </pre>
                                  </div>
                                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                                    <div className="md:col-span-2">
                                      <h4 className="text-sm font-medium mb-2 text-muted-foreground">Metadata</h4>
                                      <pre className="text-xs bg-background p-3 rounded-md overflow-auto max-h-32 border">
                                        {JSON.stringify(log.metadata, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                  <div className="md:col-span-2 text-xs text-muted-foreground">
                                    <span className="font-medium">Full Entity ID:</span> {log.entity_id}
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          </CollapsibleContent>
                        </>
                      </Collapsible>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

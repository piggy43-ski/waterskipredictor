import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowUpDown, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Coins, 
  ShoppingCart, 
  Tag, 
  Search,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  getNetSaleProceeds, 
  calculateTransferFee, 
  validateBuy, 
  validateSell 
} from '@/utils/transferWindowRules';
import { FANTASY_ROSTER_LIMITS } from '@/utils/fantasyConfig';

interface Athlete {
  id: string;
  name: string;
  country: string;
  country_code?: string | null;
  fantasy_price_slalom?: number | null;
  fantasy_price_trick?: number | null;
  fantasy_price_jump?: number | null;
  gender: string;
}

interface RosterAthlete {
  id: string;
  athlete_id: string;
  discipline: string;
  price_at_selection: number;
  athlete: Athlete;
}

interface TransferWindowProps {
  entryId: string;
  potId: string;
  remainingBudget: number;
  transferFeePercent: number;
  maxTransfersPerWindow?: number | null;
  transfersMade: number;
  currentWindowTournamentId?: string | null;
  roster: RosterAthlete[];
  disciplineScope: string[];
  onTransferComplete: () => void;
}

export function TransferWindow({
  entryId,
  potId,
  remainingBudget,
  transferFeePercent,
  maxTransfersPerWindow,
  transfersMade,
  currentWindowTournamentId,
  roster,
  disciplineScope,
  onTransferComplete
}: TransferWindowProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiscipline, setSelectedDiscipline] = useState<string>(disciplineScope[0] || 'slalom');
  const [availableAthletes, setAvailableAthletes] = useState<Athlete[]>([]);
  const [loadingAthletes, setLoadingAthletes] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Confirmation dialogs
  const [buyDialog, setBuyDialog] = useState<{ athlete: Athlete; discipline: string } | null>(null);
  const [sellDialog, setSellDialog] = useState<RosterAthlete | null>(null);

  // Get current roster athlete IDs
  const rosterAthleteIds = roster.map(r => r.athlete_id);
  const rosterByDiscipline = {
    slalom: roster.filter(r => r.discipline === 'slalom'),
    trick: roster.filter(r => r.discipline === 'trick'),
    jump: roster.filter(r => r.discipline === 'jump'),
  };

  const loadAvailableAthletes = async (discipline: string) => {
    setLoadingAthletes(true);
    try {
      const priceColumn = `fantasy_price_${discipline}` as keyof Athlete;
      
      const { data, error } = await supabase
        .from('athletes')
        .select('id, name, country, country_code, gender, fantasy_price_slalom, fantasy_price_trick, fantasy_price_jump')
        .contains('disciplines', [discipline])
        .not(priceColumn, 'is', null)
        .order('name');

      if (error) throw error;
      
      // Filter out athletes already on roster for this discipline
      const rosterIdsForDiscipline = roster
        .filter(r => r.discipline === discipline)
        .map(r => r.athlete_id);
      
      setAvailableAthletes((data || []).filter(a => !rosterIdsForDiscipline.includes(a.id)));
    } catch (error) {
      console.error('Error loading athletes:', error);
      toast({ title: 'Error', description: 'Failed to load athletes', variant: 'destructive' });
    } finally {
      setLoadingAthletes(false);
    }
  };

  const handleTabChange = (discipline: string) => {
    setSelectedDiscipline(discipline);
    setSearchQuery('');
    loadAvailableAthletes(discipline);
  };

  const getAthletePrice = (athlete: Athlete, discipline: string): number => {
    const priceKey = `fantasy_price_${discipline}` as keyof Athlete;
    return (athlete[priceKey] as number) || 0;
  };

  const handleBuy = async () => {
    if (!buyDialog) return;
    
    const { athlete, discipline } = buyDialog;
    const price = getAthletePrice(athlete, discipline);
    
    // Validate
    const maxSize = FANTASY_ROSTER_LIMITS[discipline as keyof typeof FANTASY_ROSTER_LIMITS] || 10;
    const currentSize = rosterByDiscipline[discipline as keyof typeof rosterByDiscipline]?.length || 0;
    const validation = validateBuy(price, remainingBudget, currentSize, maxSize);
    
    if (!validation.valid) {
      toast({ title: 'Cannot Buy', description: validation.error, variant: 'destructive' });
      return;
    }

    setProcessing(true);
    try {
      // Add athlete to roster
      const { error: addError } = await supabase
        .from('fantasy_entry_athletes')
        .insert({
          entry_id: entryId,
          athlete_id: athlete.id,
          discipline,
          price_at_selection: price
        });

      if (addError) throw addError;

      // Record transfer
      const { error: transferError } = await supabase
        .from('fantasy_transfers')
        .insert({
          entry_id: entryId,
          athlete_id: athlete.id,
          discipline,
          transfer_type: 'buy',
          price,
          transfer_window: currentWindowTournamentId
        });

      if (transferError) throw transferError;

      // Update entry budget and transfer count
      const { error: updateError } = await supabase
        .from('fantasy_entries')
        .update({
          remaining_budget: remainingBudget - price,
          transfers_made: transfersMade + 1
        })
        .eq('id', entryId);

      if (updateError) throw updateError;

      toast({ title: 'Transfer Complete', description: `Bought ${athlete.name} for ${price.toLocaleString()} tokens` });
      setBuyDialog(null);
      onTransferComplete();
    } catch (error: any) {
      console.error('Buy error:', error);
      toast({ title: 'Transfer Failed', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const handleSell = async () => {
    if (!sellDialog) return;
    
    const athlete = sellDialog.athlete;
    const discipline = sellDialog.discipline;
    const currentPrice = getAthletePrice(athlete, discipline);
    const netProceeds = getNetSaleProceeds(currentPrice, transferFeePercent);
    const fee = calculateTransferFee(currentPrice, transferFeePercent);

    setProcessing(true);
    try {
      // Remove from roster
      const { error: removeError } = await supabase
        .from('fantasy_entry_athletes')
        .delete()
        .eq('id', sellDialog.id);

      if (removeError) throw removeError;

      // Record transfer
      const { error: transferError } = await supabase
        .from('fantasy_transfers')
        .insert({
          entry_id: entryId,
          athlete_id: athlete.id,
          discipline,
          transfer_type: 'sell',
          price: currentPrice,
          transfer_window: currentWindowTournamentId
        });

      if (transferError) throw transferError;

      // Update entry budget and transfer count
      const { error: updateError } = await supabase
        .from('fantasy_entries')
        .update({
          remaining_budget: remainingBudget + netProceeds,
          transfers_made: transfersMade + 1
        })
        .eq('id', entryId);

      if (updateError) throw updateError;

      toast({ 
        title: 'Transfer Complete', 
        description: fee > 0 
          ? `Sold ${athlete.name} for ${netProceeds.toLocaleString()} tokens (${fee.toLocaleString()} fee)`
          : `Sold ${athlete.name} for ${netProceeds.toLocaleString()} tokens`
      });
      setSellDialog(null);
      onTransferComplete();
    } catch (error: any) {
      console.error('Sell error:', error);
      toast({ title: 'Transfer Failed', description: error.message, variant: 'destructive' });
    } finally {
      setProcessing(false);
    }
  };

  const filteredAthletes = availableAthletes.filter(a => 
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.country.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canMakeTransfer = !maxTransfersPerWindow || transfersMade < maxTransfersPerWindow;

  return (
    <div className="space-y-4">
      {/* Budget Display */}
      <Card className="bg-gradient-water text-primary-foreground">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">Remaining Budget</p>
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5" />
                <span className="text-2xl font-bold">{remainingBudget.toLocaleString()}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm opacity-90">Transfers Made</p>
              <span className="text-2xl font-bold">
                {transfersMade}
                {maxTransfersPerWindow && <span className="text-lg opacity-75">/{maxTransfersPerWindow}</span>}
              </span>
            </div>
          </div>
          {transferFeePercent > 0 && (
            <p className="text-xs opacity-75 mt-2">
              Note: {transferFeePercent}% fee on sales
            </p>
          )}
        </CardContent>
      </Card>

      {!canMakeTransfer && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <p className="text-sm">You've reached the maximum transfers for this window.</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="sell" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sell" className="gap-2">
            <Tag className="w-4 h-4" />
            Sell
          </TabsTrigger>
          <TabsTrigger value="buy" className="gap-2" onClick={() => loadAvailableAthletes(selectedDiscipline)}>
            <ShoppingCart className="w-4 h-4" />
            Buy
          </TabsTrigger>
        </TabsList>

        {/* SELL TAB */}
        <TabsContent value="sell" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Sell athletes from your roster to free up budget.
          </p>
          
          {disciplineScope.map(disc => {
            const discAthletes = roster.filter(r => r.discipline === disc);
            if (discAthletes.length === 0) return null;

            return (
              <Card key={disc}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm capitalize">{disc}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {discAthletes.map(ra => {
                      const currentPrice = getAthletePrice(ra.athlete, ra.discipline);
                      const priceDiff = currentPrice - ra.price_at_selection;
                      const netProceeds = getNetSaleProceeds(currentPrice, transferFeePercent);

                      return (
                        <div key={ra.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                          <div>
                            <p className="font-medium">{ra.athlete.name}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{ra.athlete.country_code || ra.athlete.country}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                Bought: {ra.price_at_selection.toLocaleString()}
                                {priceDiff !== 0 && (
                                  <span className={priceDiff > 0 ? 'text-emerald-500' : 'text-destructive'}>
                                    {priceDiff > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {priceDiff > 0 ? '+' : ''}{priceDiff.toLocaleString()}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            disabled={!canMakeTransfer || processing}
                            onClick={() => setSellDialog(ra)}
                          >
                            Sell ({netProceeds.toLocaleString()})
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* BUY TAB */}
        <TabsContent value="buy" className="mt-4 space-y-4">
          <div className="flex gap-2">
            {disciplineScope.map(disc => (
              <Button
                key={disc}
                size="sm"
                variant={selectedDiscipline === disc ? 'default' : 'outline'}
                onClick={() => handleTabChange(disc)}
                className="capitalize"
              >
                {disc}
              </Button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search athletes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <ScrollArea className="h-[400px]">
            {loadingAthletes ? (
              <p className="text-center text-muted-foreground py-8">Loading athletes...</p>
            ) : filteredAthletes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No athletes found</p>
            ) : (
              <div className="space-y-2">
                {filteredAthletes.map(athlete => {
                  const price = getAthletePrice(athlete, selectedDiscipline);
                  const canAfford = price <= remainingBudget;

                  return (
                    <div 
                      key={athlete.id} 
                      className={`flex items-center justify-between p-3 rounded-lg border ${canAfford ? 'bg-background' : 'bg-muted/50 opacity-60'}`}
                    >
                      <div>
                        <p className="font-medium">{athlete.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{athlete.country_code || athlete.country}</span>
                          <span>•</span>
                          <Badge variant="outline" className="text-xs">
                            {athlete.gender === 'male' ? 'M' : 'F'}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-primary">{price.toLocaleString()}</p>
                        <Button 
                          size="sm" 
                          disabled={!canAfford || !canMakeTransfer || processing}
                          onClick={() => setBuyDialog({ athlete, discipline: selectedDiscipline })}
                        >
                          Buy
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Buy Confirmation Dialog */}
      <Dialog open={!!buyDialog} onOpenChange={() => setBuyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Purchase</DialogTitle>
          </DialogHeader>
          {buyDialog && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                <div>
                  <p className="font-semibold">{buyDialog.athlete.name}</p>
                  <p className="text-sm text-muted-foreground capitalize">{buyDialog.discipline}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">
                    {getAthletePrice(buyDialog.athlete, buyDialog.discipline).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">tokens</p>
                </div>
              </div>
              <div className="text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Current Budget:</span>
                  <span>{remainingBudget.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>After Purchase:</span>
                  <span>{(remainingBudget - getAthletePrice(buyDialog.athlete, buyDialog.discipline)).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyDialog(null)}>Cancel</Button>
            <Button onClick={handleBuy} disabled={processing}>
              {processing ? 'Processing...' : 'Confirm Purchase'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sell Confirmation Dialog */}
      <Dialog open={!!sellDialog} onOpenChange={() => setSellDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Sale</DialogTitle>
          </DialogHeader>
          {sellDialog && (() => {
            const currentPrice = getAthletePrice(sellDialog.athlete, sellDialog.discipline);
            const fee = calculateTransferFee(currentPrice, transferFeePercent);
            const netProceeds = getNetSaleProceeds(currentPrice, transferFeePercent);
            
            return (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg bg-muted">
                  <div>
                    <p className="font-semibold">{sellDialog.athlete.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">{sellDialog.discipline}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{netProceeds.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">tokens received</p>
                  </div>
                </div>
                <div className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Market Price:</span>
                    <span>{currentPrice.toLocaleString()}</span>
                  </div>
                  {fee > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Transfer Fee ({transferFeePercent}%):</span>
                      <span className="text-destructive">-{fee.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium border-t pt-1">
                    <span>You Receive:</span>
                    <span className="text-primary">{netProceeds.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground mt-2">
                    <span>New Budget:</span>
                    <span>{(remainingBudget + netProceeds).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellDialog(null)}>Cancel</Button>
            <Button onClick={handleSell} disabled={processing} variant="destructive">
              {processing ? 'Processing...' : 'Confirm Sale'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

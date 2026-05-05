import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is authenticated and is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Check if user has admin role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError || !roleData) {
      console.error('User is not an admin:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const { user_id } = await req.json();
    
    if (!user_id) {
      throw new Error('user_id is required');
    }

    console.log('Starting automated settlement test for user:', user_id);
    const results: Record<string, unknown> = {};

    // Step 1: Create test tournament
    const tournamentId = crypto.randomUUID();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const { error: tournamentError } = await supabase
      .from('tournaments')
      .insert({
        id: tournamentId,
        name: `Auto Test Tournament ${Date.now()}`,
        location: 'Test Location',
        status: 'finished',
        disciplines: ['slalom', 'trick', 'jump'],
        start_date: yesterday.toISOString().split('T')[0],
        end_date: yesterday.toISOString().split('T')[0],
        year: new Date().getFullYear()
      });

    if (tournamentError) throw new Error(`Tournament creation failed: ${tournamentError.message}`);
    console.log('Created tournament:', tournamentId);
    results.tournament_id = tournamentId;

    // Step 2: Get existing athletes (6 total - 3 male, 3 female)
    const { data: athletes, error: athletesError } = await supabase
      .from('athletes')
      .select('id, name, gender, disciplines')
      .limit(10);

    if (athletesError) throw new Error(`Athletes fetch failed: ${athletesError.message}`);
    if (!athletes || athletes.length < 6) throw new Error('Not enough athletes in database');

    const maleAthletes = athletes.filter(a => a.gender === 'male').slice(0, 3);
    const femaleAthletes = athletes.filter(a => a.gender === 'female').slice(0, 3);
    const selectedAthletes = [...maleAthletes, ...femaleAthletes];
    
    console.log('Selected athletes:', selectedAthletes.map(a => a.name));
    results.athletes = selectedAthletes.map(a => a.name);

    // Step 3: Create tournament entries
    const tournamentEntries = [];
    for (const athlete of selectedAthletes) {
      for (const discipline of ['slalom', 'trick', 'jump']) {
        tournamentEntries.push({
          tournament_id: tournamentId,
          athlete_id: athlete.id,
          discipline,
          custom_odds: 2.0 + Math.random() * 3
        });
      }
    }

    const { error: entriesError } = await supabase
      .from('tournament_entries')
      .insert(tournamentEntries);

    if (entriesError) throw new Error(`Tournament entries failed: ${entriesError.message}`);
    console.log('Created tournament entries:', tournamentEntries.length);

    // Step 4: Create markets and selections
    // Note: markets table uses 'category' (open_men/open_women), not 'gender'
    const markets: { id: string; tournament_id: string; name: string; market_type: string; discipline: string; category: string }[] = [];
    const genderCategories = [
      { gender: 'male', category: 'open_men' },
      { gender: 'female', category: 'open_women' }
    ];
    const disciplines = ['slalom', 'trick', 'jump'];

    for (const { gender, category } of genderCategories) {
      for (const discipline of disciplines) {
        markets.push({
          id: crypto.randomUUID(),
          tournament_id: tournamentId,
          name: `${gender} ${discipline} Winner`,
          market_type: 'WINNER',
          discipline,
          category
        });
      }
    }

    const { error: marketsError } = await supabase
      .from('markets')
      .insert(markets);

    if (marketsError) throw new Error(`Markets creation failed: ${marketsError.message}`);
    console.log('Created markets:', markets.length);

    // Create selections for each market
    const selections = [];
    for (const market of markets) {
      // Derive gender from category
      const isMale = market.category === 'open_men';
      const genderAthletes = isMale ? maleAthletes : femaleAthletes;
      for (let i = 0; i < genderAthletes.length; i++) {
        selections.push({
          id: crypto.randomUUID(),
          market_id: market.id,
          athlete_id: genderAthletes[i].id,
          description: `${genderAthletes[i].name} to win ${market.discipline}`,
          decimal_odds: 2.0 + i * 0.5
        });
      }
    }

    const { error: selectionsError } = await supabase
      .from('selections')
      .insert(selections);

    if (selectionsError) throw new Error(`Selections creation failed: ${selectionsError.message}`);
    console.log('Created selections:', selections.length);
    results.selections_created = selections.length;

    // Step 5: Create fantasy pot
    const potId = crypto.randomUUID();
    const { error: potError } = await supabase
      .from('fantasy_pots')
      .insert({
        id: potId,
        name: `Auto Test Fantasy Pot ${Date.now()}`,
        pot_type: 'tournament',
        tournament_id: tournamentId,
        entry_fee_tokens: 100,
        team_budget: 50000,
        payout_structure: 'winner_takes_all',
        status: 'open',
        created_by: user_id,
        visibility: 'public',
        discipline_scope: ['slalom', 'trick', 'jump']
      });

    if (potError) throw new Error(`Fantasy pot creation failed: ${potError.message}`);
    console.log('Created fantasy pot:', potId);
    results.fantasy_pot_id = potId;

    // Step 6: Deduct entry fee and create fantasy entry
    const { data: wallet, error: walletError } = await supabase
      .from('token_wallets')
      .select('earned_tokens')
      .eq('user_id', user_id)
      .single();

    if (walletError) throw new Error(`Wallet fetch failed: ${walletError.message}`);
    
    const initialBalance = wallet.earned_tokens;
    const newBalance = initialBalance - 100;

    await supabase
      .from('token_wallets')
      .update({ earned_tokens: newBalance })
      .eq('user_id', user_id);

    await supabase
      .from('token_transactions')
      .insert({
        user_id,
        type: 'fantasy_entry',
        amount: -100,
        balance_after: newBalance,
        description: 'Fantasy entry fee (auto test)',
        reference_id: potId,
        reference_type: 'fantasy_pot'
      });

    const entryId = crypto.randomUUID();
    const { error: entryError } = await supabase
      .from('fantasy_entries')
      .insert({
        id: entryId,
        pot_id: potId,
        user_id,
        team_name: 'Auto Test Team',
        total_team_value: 0,
        total_points: 0
      });

    if (entryError) throw new Error(`Fantasy entry creation failed: ${entryError.message}`);
    console.log('Created fantasy entry:', entryId);
    results.fantasy_entry_id = entryId;

    // Add athletes to fantasy roster
    const rosterAthletes = selectedAthletes.slice(0, 3);
    const fantasyEntryAthletes = rosterAthletes.map((athlete, i) => ({
      entry_id: entryId,
      athlete_id: athlete.id,
      discipline: disciplines[i],
      price_at_selection: 10000,
      points_earned: 0
    }));

    const { error: rosterError } = await supabase
      .from('fantasy_entry_athletes')
      .insert(fantasyEntryAthletes);

    if (rosterError) throw new Error(`Fantasy roster failed: ${rosterError.message}`);
    console.log('Added athletes to roster');

    // Step 7: Create predictions (entries)
    // Get current wallet balance for entry
    const { data: currentWallet } = await supabase
      .from('token_wallets')
      .select('earned_tokens')
      .eq('user_id', user_id)
      .single();

    const entryBalance = currentWallet?.earned_tokens || 0;
    
    // Create a single entry
    const singleSelection = selections[0];
    const singleMarket = markets.find(m => m.id === singleSelection.market_id)!;
    const singleStake = 100;
    const singlePayout = Math.floor(singleStake * singleSelection.decimal_odds);
    
    // Deduct stake
    await supabase
      .from('token_wallets')
      .update({ earned_tokens: entryBalance - singleStake })
      .eq('user_id', user_id);

    // Create entry record for single
    const singleEntryId = crypto.randomUUID();
    const { error: singleSlipError } = await supabase
      .from('bet_slips')
      .insert({
        id: singleEntryId,
        user_id,
        tournament_id: tournamentId,
        type: 'single',
        leg_count: 1,
        total_stake_tokens: singleStake,
        total_odds_decimal: singleSelection.decimal_odds,
        total_odds_american: Math.round((singleSelection.decimal_odds - 1) * 100),
        potential_payout_tokens: singlePayout,
        status: 'PENDING'
      });

    if (singleSlipError) {
      console.error('Single bet_slip insert failed:', singleSlipError);
      results.single_entry_created = false;
      results.single_entry_error = singleSlipError.message;
    } else {
      // Get athlete name for prediction
      const singleAthlete = selectedAthletes.find(a => a.id === singleSelection.athlete_id);

      const { error: singlePredError } = await supabase
        .from('predictions')
        .insert({
          user_id,
          selection_id: singleSelection.id,
          bet_slip_id: singleEntryId,
          staked_tokens: singleStake,
          decimal_odds: singleSelection.decimal_odds,
          potential_payout: singlePayout,
          status: 'PENDING',
          market_type: 'WINNER',
          discipline: singleMarket.discipline,
          category: singleMarket.category,
          tournament_name: `Auto Test Tournament`,
          athlete_name: singleAthlete?.name || 'Unknown'
        });

      if (singlePredError) {
        console.error('Single prediction insert failed:', singlePredError);
        results.single_entry_created = false;
        results.single_entry_error = singlePredError.message;
      } else {
        await supabase
          .from('token_transactions')
          .insert({
            user_id,
            type: 'entry_placed',
            amount: -singleStake,
            balance_after: entryBalance - singleStake,
            description: 'Single entry placed (auto test)',
            reference_id: singleEntryId,
            reference_type: 'entry'
          });
        console.log('Created single entry');
        results.single_entry_created = true;
      }
    }

    // Create a parlay entry (2 legs)
    const parlaySelections = [selections[1], selections[3]];
    const parlayStake = 100;
    const parlayOdds = parlaySelections.reduce((acc, s) => acc * s.decimal_odds, 1);
    const parlayPayout = Math.floor(parlayStake * parlayOdds);

    const { data: parlayWallet } = await supabase
      .from('token_wallets')
      .select('earned_tokens')
      .eq('user_id', user_id)
      .single();

    const parlayBalance = parlayWallet?.earned_tokens || 0;

    await supabase
      .from('token_wallets')
      .update({ earned_tokens: parlayBalance - parlayStake })
      .eq('user_id', user_id);

    const parlayEntryId = crypto.randomUUID();
    const { error: parlaySlipError } = await supabase
      .from('bet_slips')
      .insert({
        id: parlayEntryId,
        user_id,
        tournament_id: tournamentId,
        type: 'parlay',
        leg_count: 2,
        total_stake_tokens: parlayStake,
        total_odds_decimal: parlayOdds,
        total_odds_american: Math.round((parlayOdds - 1) * 100),
        potential_payout_tokens: parlayPayout,
        status: 'PENDING'
      });

    if (parlaySlipError) {
      console.error('Parlay bet_slip insert failed:', parlaySlipError);
      results.parlay_entry_created = false;
      results.parlay_entry_error = parlaySlipError.message;
    } else {
      let parlayLegError: string | null = null;
      for (const sel of parlaySelections) {
        const parlayAthlete = selectedAthletes.find(a => a.id === sel.athlete_id);
        const legMarket = markets.find(m => m.id === sel.market_id)!;
        const { error: legError } = await supabase
          .from('predictions')
          .insert({
            user_id,
            selection_id: sel.id,
            bet_slip_id: parlayEntryId,
            staked_tokens: parlayStake,
            decimal_odds: sel.decimal_odds,
            potential_payout: parlayPayout,
            status: 'PENDING',
            market_type: 'WINNER',
            discipline: legMarket.discipline,
            category: legMarket.category,
            tournament_name: `Auto Test Tournament`,
            athlete_name: parlayAthlete?.name || 'Unknown'
          });
        if (legError) {
          console.error('Parlay leg prediction insert failed:', legError);
          parlayLegError = legError.message;
          break;
        }
      }

      if (parlayLegError) {
        results.parlay_entry_created = false;
        results.parlay_entry_error = parlayLegError;
      } else {
        await supabase
          .from('token_transactions')
          .insert({
            user_id,
            type: 'entry_placed',
            amount: -parlayStake,
            balance_after: parlayBalance - parlayStake,
            description: 'Parlay entry placed (auto test)',
            reference_id: parlayEntryId,
            reference_type: 'entry'
          });
        console.log('Created parlay entry');
        results.parlay_entry_created = true;
      }
    }

    // Step 8: Create athlete results
    const athleteResults = [];
    let position = 1;
    const gendersForResults = ['male', 'female'];
    
    for (const gender of gendersForResults) {
      const genderAthletes = gender === 'male' ? maleAthletes : femaleAthletes;
      for (const discipline of disciplines) {
        position = 1;
        for (const athlete of genderAthletes) {
          let score: number;
          if (discipline === 'slalom') {
            score = 4 - position * 0.5; // Higher is better for slalom (buoys)
          } else if (discipline === 'trick') {
            score = 10000 - position * 1000; // Higher points is better
          } else {
            score = 60 - position * 5; // Jump distance in meters
          }

          athleteResults.push({
            tournament_id: tournamentId,
            athlete_id: athlete.id,
            discipline,
            gender,
            position,
            score_raw: score,
            made_finals: true
          });
          position++;
        }
      }
    }

    const { error: resultsError } = await supabase
      .from('athlete_results')
      .insert(athleteResults);

    if (resultsError) throw new Error(`Athlete results failed: ${resultsError.message}`);
    console.log('Created athlete results:', athleteResults.length);
    results.athlete_results_created = athleteResults.length;

    // Step 9: Mark winning selections
    // First athlete in each gender wins for each discipline
    for (const market of markets) {
      const isMale = market.category === 'open_men';
      const genderAthletes = isMale ? maleAthletes : femaleAthletes;
      const winningAthleteId = genderAthletes[0].id;
      
      // Mark winner
      await supabase
        .from('selections')
        .update({ result: 'WON' })
        .eq('market_id', market.id)
        .eq('athlete_id', winningAthleteId);

      // Mark losers
      await supabase
        .from('selections')
        .update({ result: 'LOST' })
        .eq('market_id', market.id)
        .neq('athlete_id', winningAthleteId);
    }

    console.log('Marked selection results');

    // Step 10: Score fantasy
    console.log('Triggering fantasy scoring...');
    const { data: scoreData, error: scoreError } = await supabase.functions.invoke('score-fantasy', {
      body: { tournament_id: tournamentId }
    });

    if (scoreError) {
      console.error('Fantasy scoring error:', scoreError);
      results.fantasy_scoring_error = scoreError.message;
    } else {
      console.log('Fantasy scoring complete:', scoreData);
      results.fantasy_scoring = scoreData;
    }

    // Step 11: Settle predictions
    console.log('Settling predictions...');
    const selectionResults = selections.map(sel => {
      const market = markets.find(m => m.id === sel.market_id);
      const genderAthletes = market?.category === 'open_men' ? maleAthletes : femaleAthletes;
      const isWinner = sel.athlete_id === genderAthletes[0].id;
      return {
        selection_id: sel.id,
        result: isWinner ? 'WON' : 'LOST'
      };
    });

    const { data: settleData, error: settleError } = await supabase.functions.invoke('settle-predictions', {
      body: { selections: selectionResults }
    });

    if (settleError) {
      console.error('Settlement error:', settleError);
      results.settlement_error = settleError.message;
    } else {
      console.log('Settlement complete:', settleData);
      results.predictions_settlement = settleData;
    }

    // Step 12: Settle fantasy pot
    console.log('Settling fantasy pot...');
    const { data: potSettleData, error: potSettleError } = await supabase.functions.invoke('settle-fantasy-pot', {
      body: { pot_id: potId }
    });

    if (potSettleError) {
      console.error('Fantasy pot settlement error:', potSettleError);
      results.fantasy_pot_settlement_error = potSettleError.message;
    } else {
      console.log('Fantasy pot settled:', potSettleData);
      results.fantasy_pot_settlement = potSettleData;
    }

    // Get final wallet balance
    const { data: finalWallet } = await supabase
      .from('token_wallets')
      .select('earned_tokens')
      .eq('user_id', user_id)
      .single();

    results.initial_balance = initialBalance;
    results.final_balance = finalWallet?.earned_tokens || 0;
    results.balance_change = (finalWallet?.earned_tokens || 0) - initialBalance;

    console.log('Automated test complete!', results);

    return new Response(JSON.stringify({
      success: true,
      message: 'Automated settlement test completed',
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error in run-settlement-test:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

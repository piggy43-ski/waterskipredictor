import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DuplicateMarket {
  tournament_id: string;
  discipline: string;
  category: string;
  market_type: string;
  count: number;
  market_ids: string[];
}

interface DuplicateSelection {
  market_id: string;
  athlete_id: string;
  athlete_name: string;
  count: number;
  selection_ids: string[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
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
      .single();

    if (roleError || !roleData) {
      console.error('User is not an admin:', user.id);
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log('Starting data integrity check...');

    // Check for duplicate markets
    const { data: markets, error: marketsError } = await supabase
      .from('markets')
      .select('id, tournament_id, discipline, category, market_type');

    if (marketsError) {
      console.error('Error fetching markets:', marketsError);
      throw marketsError;
    }

    // Group markets to find duplicates
    const marketGroups = new Map<string, string[]>();
    markets?.forEach((market) => {
      const key = `${market.tournament_id}|${market.discipline}|${market.category}|${market.market_type}`;
      if (!marketGroups.has(key)) {
        marketGroups.set(key, []);
      }
      marketGroups.get(key)!.push(market.id);
    });

    const duplicateMarkets: DuplicateMarket[] = [];
    marketGroups.forEach((ids, key) => {
      if (ids.length > 1) {
        const [tournament_id, discipline, category, market_type] = key.split('|');
        duplicateMarkets.push({
          tournament_id,
          discipline,
          category,
          market_type,
          count: ids.length,
          market_ids: ids,
        });
      }
    });

    // Check for duplicate selections within markets
    const { data: selections, error: selectionsError } = await supabase
      .from('selections')
      .select(`
        id,
        market_id,
        athlete_id,
        athlete:athletes (
          name
        )
      `);

    if (selectionsError) {
      console.error('Error fetching selections:', selectionsError);
      throw selectionsError;
    }

    // Group selections to find duplicates
    const selectionGroups = new Map<string, { ids: string[]; athlete_name: string }>();
    selections?.forEach((selection: any) => {
      const key = `${selection.market_id}|${selection.athlete_id}`;
      if (!selectionGroups.has(key)) {
        selectionGroups.set(key, {
          ids: [],
          athlete_name: selection.athlete?.name || 'Unknown',
        });
      }
      selectionGroups.get(key)!.ids.push(selection.id);
    });

    const duplicateSelections: DuplicateSelection[] = [];
    selectionGroups.forEach((data, key) => {
      if (data.ids.length > 1) {
        const [market_id, athlete_id] = key.split('|');
        duplicateSelections.push({
          market_id,
          athlete_id,
          athlete_name: data.athlete_name,
          count: data.ids.length,
          selection_ids: data.ids,
        });
      }
    });

    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      total_markets_checked: markets?.length || 0,
      total_selections_checked: selections?.length || 0,
      duplicate_markets_found: duplicateMarkets.length,
      duplicate_selections_found: duplicateSelections.length,
      duplicate_markets: duplicateMarkets,
      duplicate_selections: duplicateSelections,
      status: duplicateMarkets.length === 0 && duplicateSelections.length === 0 ? 'CLEAN' : 'ISSUES_FOUND',
    };

    // Log the report
    console.log('=== DATA INTEGRITY CHECK REPORT ===');
    console.log(`Status: ${report.status}`);
    console.log(`Total Markets Checked: ${report.total_markets_checked}`);
    console.log(`Total Selections Checked: ${report.total_selections_checked}`);
    console.log(`Duplicate Markets Found: ${report.duplicate_markets_found}`);
    console.log(`Duplicate Selections Found: ${report.duplicate_selections_found}`);

    if (duplicateMarkets.length > 0) {
      console.log('\n⚠️ DUPLICATE MARKETS:');
      duplicateMarkets.forEach((dup, index) => {
        console.log(`${index + 1}. Tournament: ${dup.tournament_id}`);
        console.log(`   ${dup.discipline} ${dup.category} ${dup.market_type}`);
        console.log(`   Count: ${dup.count}, IDs: ${dup.market_ids.join(', ')}`);
      });
    }

    if (duplicateSelections.length > 0) {
      console.log('\n⚠️ DUPLICATE SELECTIONS:');
      duplicateSelections.forEach((dup, index) => {
        console.log(`${index + 1}. Athlete: ${dup.athlete_name}`);
        console.log(`   Market ID: ${dup.market_id}`);
        console.log(`   Count: ${dup.count}, IDs: ${dup.selection_ids.join(', ')}`);
      });
    }

    console.log('=== END OF REPORT ===\n');

    return new Response(
      JSON.stringify(report, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Data integrity check error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

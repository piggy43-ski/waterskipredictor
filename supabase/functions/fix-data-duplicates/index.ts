import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.84.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role key for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify admin authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // Check if user has admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roles) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    console.log('Starting duplicate cleanup...');

    // Find and fix duplicate markets
    const { data: markets } = await supabase
      .from('markets')
      .select('id, tournament_id, discipline, category, market_type');

    const marketGroups = new Map<string, string[]>();
    markets?.forEach((market) => {
      const key = `${market.tournament_id}|${market.discipline}|${market.category}|${market.market_type}`;
      if (!marketGroups.has(key)) {
        marketGroups.set(key, []);
      }
      marketGroups.get(key)!.push(market.id);
    });

    const marketsToDelete: string[] = [];
    const selectionsToDelete: string[] = [];

    // For each group of duplicate markets, keep the one with most selections
    for (const [key, marketIds] of marketGroups.entries()) {
      if (marketIds.length > 1) {
        console.log(`Found ${marketIds.length} duplicate markets for: ${key}`);
        
        // Count selections for each market
        const selectionCounts = await Promise.all(
          marketIds.map(async (marketId) => {
            const { count } = await supabase
              .from('selections')
              .select('*', { count: 'exact', head: true })
              .eq('market_id', marketId);
            return { marketId, count: count || 0 };
          })
        );

        // Sort by selection count descending and keep the first (highest)
        selectionCounts.sort((a, b) => b.count - a.count);
        const toKeep = selectionCounts[0].marketId;
        const toDelete = marketIds.filter(id => id !== toKeep);

        console.log(`Keeping market ${toKeep} with ${selectionCounts[0].count} selections`);
        console.log(`Deleting markets: ${toDelete.join(', ')}`);

        marketsToDelete.push(...toDelete);

        // Get selections to delete from duplicate markets
        for (const marketId of toDelete) {
          const { data: selections } = await supabase
            .from('selections')
            .select('id')
            .eq('market_id', marketId);
          
          if (selections) {
            selectionsToDelete.push(...selections.map(s => s.id));
          }
        }
      }
    }

    // Find and fix duplicate selections within the same market
    const { data: allSelections } = await supabase
      .from('selections')
      .select('id, market_id, athlete_id');

    const selectionGroups = new Map<string, string[]>();
    allSelections?.forEach((selection) => {
      const key = `${selection.market_id}|${selection.athlete_id}`;
      if (!selectionGroups.has(key)) {
        selectionGroups.set(key, []);
      }
      selectionGroups.get(key)!.push(selection.id);
    });

    // For duplicate selections, keep the first one
    for (const [key, selectionIds] of selectionGroups.entries()) {
      if (selectionIds.length > 1) {
        console.log(`Found ${selectionIds.length} duplicate selections for: ${key}`);
        const toDelete = selectionIds.slice(1); // Keep first, delete rest
        console.log(`Keeping selection ${selectionIds[0]}, deleting: ${toDelete.join(', ')}`);
        selectionsToDelete.push(...toDelete);
      }
    }

    // Execute deletions
    let deletedSelections = 0;
    let deletedMarkets = 0;

    if (selectionsToDelete.length > 0) {
      const { error: selectionsError } = await supabase
        .from('selections')
        .delete()
        .in('id', selectionsToDelete);

      if (selectionsError) {
        console.error('Error deleting selections:', selectionsError);
        throw selectionsError;
      }
      deletedSelections = selectionsToDelete.length;
      console.log(`Deleted ${deletedSelections} duplicate selections`);
    }

    if (marketsToDelete.length > 0) {
      const { error: marketsError } = await supabase
        .from('markets')
        .delete()
        .in('id', marketsToDelete);

      if (marketsError) {
        console.error('Error deleting markets:', marketsError);
        throw marketsError;
      }
      deletedMarkets = marketsToDelete.length;
      console.log(`Deleted ${deletedMarkets} duplicate markets`);
    }

    const report = {
      timestamp: new Date().toISOString(),
      deleted_markets: deletedMarkets,
      deleted_selections: deletedSelections,
      status: 'SUCCESS',
      message: `Cleaned up ${deletedMarkets} duplicate markets and ${deletedSelections} duplicate selections`,
    };

    console.log('=== CLEANUP COMPLETE ===');
    console.log(JSON.stringify(report, null, 2));

    return new Response(
      JSON.stringify(report, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Duplicate cleanup error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage, status: 'FAILED' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});


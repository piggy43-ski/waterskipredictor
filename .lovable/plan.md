

# Add Bulk Publish Card to Admin Dashboard

## Overview

Add a new "Unpublished Markets" card to the admin dashboard (`/admin`) that shows tournaments with unpublished markets and provides a one-click "Publish All" action. This gives admins a direct shortcut without navigating through the tournament detail pages.

---

## Current State

- **18 markets** exist for "Final Test" tournament
- **0 markets** are published (`is_published = false`)
- The publish logic already exists in `ProbabilityReviewPanel.tsx` (regenerates odds + marks as published)
- Dashboard has existing pattern for action cards (Email Test, Tournaments Pending Settlement)

---

## Implementation

### 1. Add Query for Unpublished Markets

Fetch tournaments that have markets but not all are published:

```typescript
const { data: unpublishedMarkets, refetch: refetchUnpublished } = useQuery({
  queryKey: ['admin-unpublished-markets'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('tournaments')
      .select(`
        id, name, start_date,
        markets!inner(id, is_published)
      `)
      .is('settled_at', null);
    
    if (error) throw error;
    
    // Calculate published/total for each tournament
    return data.map(t => ({
      id: t.id,
      name: t.name,
      startDate: t.start_date,
      totalMarkets: t.markets.length,
      publishedMarkets: t.markets.filter(m => m.is_published).length,
      unpublishedCount: t.markets.filter(m => !m.is_published).length,
    })).filter(t => t.unpublishedCount > 0);
  },
});
```

### 2. Add Publish Mutation

Reuse the same logic from `ProbabilityReviewPanel`:

```typescript
const [publishingId, setPublishingId] = useState<string | null>(null);

const publishAllMutation = useMutation({
  mutationFn: async (tournamentId: string) => {
    // 1. Get all markets for tournament
    const { data: markets } = await supabase
      .from('markets')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('is_published', false);
    
    if (!markets?.length) return;
    
    // 2. Regenerate odds for each market
    for (const market of markets) {
      await supabase.functions.invoke('generate-market-odds', {
        body: { market_id: market.id, force: true }
      });
    }
    
    // 3. Mark all as published
    await supabase
      .from('markets')
      .update({ is_published: true, published_at: new Date().toISOString() })
      .eq('tournament_id', tournamentId);
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['admin-unpublished-markets'] });
    toast.success('All markets published!');
    setPublishingId(null);
  },
  onError: (error) => {
    toast.error(`Publish failed: ${error.message}`);
    setPublishingId(null);
  }
});
```

### 3. Add UI Card

Insert new card after the Email Test card, before the settlement section:

```text
+-------------------------------------------------------+
|  📊 Markets Ready to Publish                          |
|  Tournaments with unpublished markets                 |
+-------------------------------------------------------+
|  Final Test            18 markets | 0 published       |
|  [■■■■■■■■■■] 0%                  [Publish All]       |
+-------------------------------------------------------+
```

Features:
- Progress bar showing published/total ratio
- "Publish All" button per tournament
- Loading spinner during publish
- Badge showing count of unpublished markets
- Auto-refreshes after publish completes

---

## File Changes

| File | Change |
|------|--------|
| `src/pages/admin/Dashboard.tsx` | Add imports, query, mutation, and card UI |

---

## New Imports Required

```typescript
import { BarChart3, Upload, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useMutation, useQueryClient } from '@tanstack/react-query';
```

---

## Technical Notes

1. **Odds Regeneration**: The publish process calls `generate-market-odds` for each market before marking as published. This ensures all Monte Carlo simulations are fresh.

2. **No Schema Changes**: Uses existing `is_published` and `published_at` columns on the `markets` table.

3. **Error Handling**: If odds generation fails for any market, the mutation will stop and show an error toast. Markets already processed will remain unpublished.

4. **Query Invalidation**: After successful publish, the card auto-refreshes and will disappear once all markets are published.

---

## Expected Result

After implementation:
1. Admin opens `/admin` dashboard
2. Sees "Markets Ready to Publish" card showing "Final Test" with 18/0 markets
3. Clicks "Publish All" button
4. Spinner shows while odds regenerate and status updates
5. Success toast appears
6. Card updates to show 18/18 published (or disappears if fully published)
7. Users can now place predictions on published markets


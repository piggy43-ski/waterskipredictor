

# Update Admin Dashboard: Show Total and Pending Predictions

## Current Behavior
The Predictions card shows only **pending** predictions with label "Pending settlement", which is why you see "5" even though there are 18 total predictions in the database.

## Solution
Update the Predictions card to show both counts:
- **Total predictions** (all-time)
- **Pending** (awaiting settlement)

## Implementation Details

### File to Modify
`src/pages/admin/Dashboard.tsx`

### Changes

1. **Add a new query for total predictions count** (lines 97-108 area):
```typescript
const { data: totalPredictions } = useQuery({
  queryKey: ['admin-total-predictions'],
  queryFn: async () => {
    const { count, error } = await supabase
      .from('predictions')
      .select('*', { count: 'exact', head: true });
    
    if (error) throw error;
    return count || 0;
  },
});
```

2. **Update the Predictions card display** (lines 200-209):
```typescript
<Card>
  <CardHeader className="flex flex-row items-center justify-between pb-2">
    <CardTitle className="text-sm font-medium">Predictions</CardTitle>
    <FileCheck className="w-4 h-4 text-muted-foreground" />
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold">{totalPredictions}</div>
    <p className="text-xs text-muted-foreground">
      {pendingPredictions} pending settlement
    </p>
  </CardContent>
</Card>
```

## Result
The dashboard card will display:
- **18** (large number - total predictions)
- **5 pending settlement** (smaller text below)

This gives you full visibility into user activity while still highlighting pending work.


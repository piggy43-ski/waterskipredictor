

# Fix: Admin Tournaments Page Not Showing Dynamic Status

## Problem
The admin `/admin/tournaments` page displays the raw `status` column from the database instead of computing it dynamically. The `tournamentStatus.ts` utility (which checks `settled_at` first) is only used in the user-facing Tournaments page, not the admin page.

"Beta Testing" works because its DB status was manually set to `finished`. "Beta Testing 2" still has `status = 'upcoming'` in the DB even though `settled_at` is set.

## Fix

**File: `src/pages/admin/Tournaments.tsx`**

Import `applyDynamicStatus` and apply it when mapping query results:

```typescript
import { applyDynamicStatus } from '@/utils/tournamentStatus';
```

In the query function (~line 115-123), apply dynamic status:

```typescript
queryFn: async () => {
  const { data, error } = await supabase
    .from('tournaments')
    .select('*')
    .order('start_date', { ascending: false });
  
  if (error) throw error;
  return (data || []).map(t => ({
    ...t,
    status: applyDynamicStatus(t).status
  })) as Tournament[];
},
```

This is a 2-line change (1 import + status mapping). Beta Testing 2 will immediately show as "finished" + "Settled" since it has `settled_at` set.


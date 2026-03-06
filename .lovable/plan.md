

## Full App Test Results for Moomba Masters Launch

### What Works Well

- **Tournament detail page**: All tabs (Slalom/Trick/Jump, Men/Women, Winner/Podium/Highest) load correctly with athletes and multipliers
- **Prediction placement**: Dialog shows correctly with contest type, multiplier, balance, quick-select amounts, and projected rewards. Tokens deducted on confirm.
- **Cancel prediction (fixed)**: Status updates to CANCELLED, tokens refund correctly, prediction removed from active list on Predictions page
- **Events page**: All tournaments display with correct status badges and lock timers
- **Fantasy page**: Moomba Masters 2026 league shows as Open with correct entry fee and lock timer
- **Wallet page**: Balance, purchased/earned breakdown, and token packages all display correctly
- **Mobile layout**: Responsive design works well on iPhone viewport

### Bugs Found

#### 1. Homepage shows cancelled predictions as active (Critical)
**File**: `src/pages/Index.tsx` (lines 99-105)

The homepage queries the `predictions` table directly with `status = 'PENDING'`, but when a bet_slip is cancelled, only the `bet_slips.status` changes to `CANCELLED` — the child `predictions` rows remain `PENDING`. This causes cancelled predictions to still appear as active entries on the homepage (showing "Active: 2" and duplicate Ross Charlie cards when there should be 0).

**Fix**: Change the homepage query to join through `bet_slips` and filter by `bet_slips.status = 'PENDING'`, or alternatively update the cancel handler in `Predictions.tsx` to also set child `predictions` rows to `CANCELLED` status when the parent bet_slip is cancelled.

#### 2. Rewards page shows duplicate balance badge (Minor UI)
**File**: `src/pages/Rewards.tsx` (lines 408-416)

The Rewards page passes a custom balance badge via the `action` prop to `PageHeader`, but `PageHeader` already renders its own balance badge by default. This creates two "674" badges side by side in the header.

**Fix**: Either pass `showBalance={false}` to `PageHeader` on the Rewards page, or remove the custom `action` prop since `PageHeader` already handles balance display.

#### 3. Liability cleanup trigger case mismatch (Data Integrity)
The `cleanup_liability_on_settlement` database trigger checks for lowercase `'pending'` in the condition `IF OLD.status = 'pending'`, but the application uses uppercase `'PENDING'`. This means the trigger never fires for cancelled bet slips, leaving stale entries in `market_liability`.

**Fix**: Database migration to update the trigger to use uppercase `'PENDING'` and add `'CANCELLED'` to the list of settlement statuses that trigger cleanup.

### Implementation Order
1. Fix homepage cancelled predictions query (critical for launch)
2. Update liability cleanup trigger to handle case + CANCELLED status
3. Fix Rewards page duplicate balance badge


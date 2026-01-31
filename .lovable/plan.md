

# Add "Bet Result (Lost)" to Admin Email Test

## Overview

The email system already handles lost bet results in the backend template. This task adds a new option in the Admin Dashboard email test dropdown so you can preview/test the "lost" email variant.

---

## Current State

| Component | Status |
|-----------|--------|
| `generateBetResultEmail()` | Already handles `result: 'lost'` with red background and "Better Luck Next Time" messaging |
| Email Test Dropdown | Only shows 4 options, missing "lost" variant |
| `settle-predictions` | Already sends `result: 'lost'` to the email endpoint |

---

## Implementation

### File: `src/pages/admin/Dashboard.tsx`

**1. Update type definition (line 16)**

Add a new type variant for testing:
```typescript
type EmailType = 'welcome' | 'bet_confirmation' | 'bet_result' | 'bet_result_lost' | 'redemption_receipt';
```

**2. Add dropdown option (lines 18-23)**

Insert new entry in `EMAIL_TYPES` array:
```typescript
const EMAIL_TYPES: { value: EmailType; label: string }[] = [
  { value: 'welcome', label: 'Welcome Email' },
  { value: 'bet_confirmation', label: 'Bet Confirmation' },
  { value: 'bet_result', label: 'Bet Result (Win)' },
  { value: 'bet_result_lost', label: 'Bet Result (Lost)' },  // NEW
  { value: 'redemption_receipt', label: 'Redemption Receipt' },
];
```

**3. Add test data for lost scenario (after line 47)**

```typescript
bet_result_lost: {
  username: 'TestUser',
  athleteName: 'Freddie Winter',
  tournamentName: 'World Championships 2025',
  result: 'lost',
  stakedTokens: 500,
},
```

**4. Map `bet_result_lost` to `bet_result` when sending (in the send handler)**

When invoking the edge function, map the test type to the actual email type:
```typescript
const actualEmailType = emailType === 'bet_result_lost' ? 'bet_result' : emailType;
```

---

## Result

After implementation:
- Admin dropdown shows 5 options including "Bet Result (Lost)"
- Selecting it sends a test email with `result: 'lost'`
- Email displays: 😔 "Better Luck Next Time" with red background

---

## No Backend Changes Required

The `send-email` edge function already handles `result: 'lost'` correctly - it shows the appropriate styling and messaging. Only the admin test UI needs updating.


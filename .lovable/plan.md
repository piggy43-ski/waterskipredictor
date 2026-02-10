

# Fix: Allow Decimal Input in Tie-Break Field

## Problem
The TB (tie-break) input field strips the decimal point as you type. When you enter "2.", `parseFloat("2.")` immediately converts it to `2`, and the display value `(2).toString()` becomes `"2"` -- removing the decimal before you can type the next digit.

## Solution
Store the tie-break value as a **string** during editing and only convert to a number when saving or ranking. This preserves intermediate states like "2." and "2.5" while typing.

## Changes (1 file)

### `src/pages/admin/TournamentSettlement.tsx`

1. **Change the input's `value` and `onChange`**: Instead of converting to float on every keystroke, store the raw string and only parse it on blur (when the user leaves the field).

```typescript
// BEFORE (broken):
value={entry.tie_break_score > 0 ? entry.tie_break_score.toString() : ''}
onChange={(e) => {
  const val = parseFloat(e.target.value) || 0;
  updateResultRow(..., 'tie_break_score', val);
}}

// AFTER (fixed):
value={tbEditValue ?? (entry.tie_break_score > 0 ? entry.tie_break_score.toString() : '')}
onChange={(e) => {
  setTbEditValue(e.target.value); // Keep raw string while typing
}}
onBlur={() => {
  const val = parseFloat(tbEditValue) || 0;
  updateResultRow(..., 'tie_break_score', val);
  setTbEditValue(null); // Clear edit state
}}
```

2. **Add local edit state**: Track which TB field is being edited using a small piece of state (e.g., a `tbEditState` map keyed by `round-discipline-gender-index`) so only the actively edited field uses the raw string value.

This is the same pattern used to fix decimal input issues throughout the app -- the key insight is: never convert a string to a number and back to a string on every keystroke.


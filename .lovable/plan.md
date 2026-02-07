
## Fix Pack Name Extraction for All Packs

### Problem Identified

The `getPackName()` function in `TokenPurchasesTable.tsx` uses an incorrect regex pattern that matches neither historical nor current descriptions.

**Current implementation (line 71):**
```typescript
const match = description.match(/^(\w+)\s+Pack/i);
```

**Issue:** This looks for patterns like "Starter Pack...", but the actual descriptions from the stripe-webhook (line 387) are:
```
"Token purchase: Starter (2500 tokens)"
"Token purchase: Standard (5000 tokens)"
"Token purchase: Pro (10000 tokens)"
"Token purchase: Elite (25000 tokens)"
```

The regex doesn't match this format, so all packs show as "Unknown".

---

### Solution

Update the regex to extract the pack name from the `"Token purchase: {PackName} ({tokens} tokens)"` format:

```typescript
const getPackName = (description: string | null): string => {
  if (!description) return 'Unknown';
  // Match "Token purchase: PackName (tokens)" format
  // Captures: Starter, Standard, Pro, or Elite
  const match = description.match(/Token purchase:\s+(\w+)\s+\(/i);
  return match ? match[1] : 'Unknown';
};
```

**How it works:**
- `Token purchase:` - matches the literal prefix
- `\s+` - matches one or more whitespace characters
- `(\w+)` - captures the pack name (one or more word characters)
- `\s+` - matches one or more whitespace characters before the opening parenthesis
- `\(` - matches the literal opening parenthesis

This will correctly extract "Starter", "Standard", "Pro", or "Elite" from the description.

---

### Files to Modify

**`src/components/admin/TokenPurchasesTable.tsx`**
- Line 71: Update the regex pattern in the `getPackName()` function


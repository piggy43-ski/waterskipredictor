
# Update Instagram Link

## Overview
Update the Instagram button in the Profile page to use your correct Instagram URL.

---

## Change Required

### File: `src/pages/Profile.tsx` (line 630)

**Current:**
```javascript
onClick={() => window.open('https://instagram.com/waterskipredictor', '_blank')}
```

**Updated:**
```javascript
onClick={() => window.open('https://www.instagram.com/waterskipredictor?igsh=MWY1bjViMGxmdzczbw%3D%3D', '_blank')}
```

---

## Result
When users click "DM us on Instagram" in the Help & Support section, they'll be directed to your correct Instagram profile page.

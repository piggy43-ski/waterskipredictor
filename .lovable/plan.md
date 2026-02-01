
# Add Instagram Contact to Profile

## Overview
Add an Instagram DM contact option in the Help & Support section of the Profile page for users to reach out when something isn't working.

---

## Changes

### File: `src/pages/Profile.tsx`

**1. Add Instagram Icon Component**

Since Lucide doesn't include brand icons like Instagram, I'll create a simple Instagram SVG icon as an inline component at the top of the file (after imports).

**2. Update Help & Support Section (lines 615-640)**

Add a new button between "Help Center" and "Replay Tutorial" that:
- Shows the Instagram logo icon
- Says "DM us on Instagram"
- Links to your Instagram profile (opens in new tab)
- Includes helper text explaining it's for reporting issues

---

## Updated Help & Support Section

```text
Help & Support
├── Help Center (existing)
├── Something not working? DM us on Instagram (NEW)
│   └── Opens instagram.com/YOUR_HANDLE in new tab
└── Replay Tutorial (existing)
```

---

## Visual Design

The Instagram button will:
- Use `variant="outline"` to match other buttons
- Display the Instagram logo (gradient-colored SVG or simple outline)
- Include text: "DM us on Instagram"
- Add a small subtitle: "Something not working? Reach out!"
- Open Instagram in a new browser tab

---

## Technical Details

**Instagram Icon**: Custom inline SVG (Instagram's camera icon outline)

**Link behavior**: 
```jsx
onClick={() => window.open('https://instagram.com/YOUR_HANDLE', '_blank')}
```

**Note**: You'll need to provide your actual Instagram handle. I'll use a placeholder `waterskipredictor` that you can update.

---

## Expected Result

Users will see a prominent Instagram contact option in their profile's Help & Support section, making it easy to DM you when they encounter issues.

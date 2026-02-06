

# Update Open Graph Image for Google/Social Sharing

## Overview

Replace the default Lovable Open Graph image with your branded WaterSki Predictor logo so that Google search results and social media previews display your branding instead of Lovable's.

---

## What's Being Fixed

Currently, when your site appears in:
- Google search results
- Facebook/Twitter/LinkedIn shares
- iMessage link previews
- Slack/Discord embeds

It shows the Lovable logo because `index.html` points to `https://lovable.dev/opengraph-image-p98pqg.png`

---

## Implementation Steps

### Step 1: Add the Uploaded Image to the Project

Copy your uploaded branded image to the public folder:

```
public/og-image.png
```

### Step 2: Update Meta Tags in index.html

Update lines 17-21 in `index.html`:

**Before:**
```html
<meta property="og:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />
<meta name="twitter:image" content="https://lovable.dev/opengraph-image-p98pqg.png" />
```

**After:**
```html
<meta property="og:image" content="https://waterskipredictor.lovable.app/og-image.png" />
<meta name="twitter:image" content="https://waterskipredictor.lovable.app/og-image.png" />
```

---

## Result

After publishing:
- Google search results will show your WaterSki Predictor branding
- Social media shares will display your cyan W logo with "WATERSKI PREDICTOR" text
- Link previews in messaging apps will show your brand

**Note:** It may take a few days for Google to re-crawl and update their cached image. Social platforms like Facebook have tools to force a refresh of their cache.


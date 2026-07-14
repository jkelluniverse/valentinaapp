# Public brand assets — drop these in here

The public marketing site (`/`) looks for three of Valentina's real assets in
this folder. Until they're here, the page shows graceful fallbacks (her name in
text, no brain motif, an initialed portrait placeholder) — it never looks broken.
The moment you add a file with the exact name below, it appears.

| Put a file here named… | What it is | Notes |
|---|---|---|
| `valentina-logo.svg` | Her wordmark/logo (dark, for the cream nav) | SVG preferred; ~34px tall on screen |
| `valentina-logo-light.svg` | Light version of the logo (for the wine footer) | If you only have one, a white/reversed export |
| `valentina-portrait.jpg` | Her portrait for "Meet Valentina" | **Resize to ~900–1200px wide, compress to ~80–150KB** — it's the page's main image. `.jpg` or swap the ref to `.webp` |
| `brain-motif.svg` | The neuroscience brain graphic (decorative) | Sits faint behind the hero. Keep it light; a transparent PNG/WebP at ≤520px is fine too |

### How to add them (simplest)
Commit the files into this `public/` folder on the `claude/valentinaapp-github-repo-erf4xp`
branch (drag-and-drop in the GitHub web UI works), then let Railway redeploy.

If a filename differs (e.g. you have a `.webp` portrait), tell me and I'll point
the code at it.

# ⛵ BRUHsailer Guide Transition Tool

Halfway through the old **Landlubber** ironman guide and the new BRUHsailer update dropped? Same.

This tool figures out exactly what changed, what you missed, and gives you a step-by-step catch-up plan so you can jump back into the new guide without starting over.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)

## What it does

- **Full diff view** — Side-by-side comparison of every step in the old vs. new guide, color-coded by change type (added, removed, modified, reordered, unchanged).
- **"I'm here" selector** — Click your current step in the old guide and the tool maps it to the corresponding position in the new guide.
- **Personalized catch-up plan** — Only shows the steps you still need to complete: new steps, changed instructions, and reordered content.
- **Progress tracking** — Check off completed catch-up steps with localStorage persistence. Includes a progress bar and "jump to next incomplete" button.

## Getting started

No build step, no server — just open `index.html` in your browser.

```
git clone https://github.com/pobblesbe/bruhsailer-transition-tool.git
cd bruhsailer-transition-tool
open index.html
```

The scraped guide data is already included in `data/`.

## Re-scraping the guides (optional)

If the guides get updated again, you can refresh the data:

```bash
npm install
npm run scrape    # scrapes both guide pages → data/*.json
npm run map       # regenerates the step mapping → data/mapping.json
```

Requires Node.js and a headless browser (Puppeteer).

## How the diff works

| Color | Category | Meaning |
|-------|----------|---------|
| ⚪ Grey | Unchanged | Same step in both guides |
| 🟡 Yellow | Modified | Step exists in both but instructions changed |
| 🔵 Blue | Added | New step only in the updated guide |
| 🔴 Red | Removed | Old step no longer in the new guide |
| 🟣 Purple | Reordered | Step moved to a different position |

## Project structure

```
├── index.html          # Main app (open this)
├── app.js              # All application logic
├── style.css           # Styling
├── data/
│   ├── old-guide.json  # Scraped Landlubber steps
│   ├── new-guide.json  # Scraped updated BRUHsailer steps
│   └── mapping.json    # Step-by-step diff mapping
└── scraper/
    ├── scrape.js       # Headless browser scraper
    └── generate-mapping.js  # Diff/matching algorithm
```

## Credits

Guide content by the [BRUHsailer](https://umkyzn.github.io/BRUHsailer/) community. This tool just helps you navigate the transition.

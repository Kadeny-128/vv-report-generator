# Victory Velocity — Weekly Report Builder

A fast, zero-dependency tool for building beautiful, client-ready **GEO / SEO weekly
performance reports**. Fill in the week's data on the left, watch a polished report
build live on the right, then export a print-ready PDF.

**Live tool:** https://kadeny-128.github.io/vv-report-generator/

---

## What it does

- **Two report looks** — a clean, agency-grade **Professional** theme for client PDFs,
  and the signature dark **Editorial** theme. Toggle any time; the builder UI stays dark.
- **Multi-client / multi-week** — keep a separate history for every client, switch
  between reporting weeks, and roll a new week forward (priorities carried over,
  baselines auto-filled from last week's actuals).
- **Search Console KPIs** — Impressions, Clicks, CTR and Avg. Position with
  automatic % change vs. baseline, correct "lower-is-better" handling for position,
  optional auto-calculated CTR, and **multi-week trend sparklines**.
- **GEO visibility** — track which AI engines (ChatGPT, Perplexity, Claude, Gemini,
  Google AI Overviews, Bing Copilot, Grok) cite the client, with a coverage score,
  citation bar and week-over-week trend.
- **Rich sections** — Executive Summary, Highlights / Wins, Work Completed,
  Next-Week Priorities, Blockers / Risks and Notes. Add, delete, **drag-reorder**
  and duplicate rows everywhere.
- **Voice dictation** — click the mic on any text field (or the header Voice button)
  to dictate, powered by the browser's Web Speech API. *(Chrome, Edge and Safari.)*
- **Never lose work** — everything autosaves to your browser. Download a full
  **`.json` backup**, import it on another machine, or export a single report to share.
- **Client logo**, dynamic PDF filename, responsive layout, and a bulletproof print
  stylesheet.

## Using it

1. Pick or create a **client**, then a **reporting week** (the `+` carries last week
   forward and sets baselines automatically).
2. Fill in metrics, AI-engine spot checks, work, priorities and notes. The preview
   updates as you type and saves automatically.
3. Choose **Professional** or **Editorial**, then hit **Export PDF** (`Cmd/Ctrl-P`)
   — the file is named for the client and week.

## Project structure

This is a static site with **no build step and no dependencies** — open `index.html`
directly or host the folder anywhere (e.g. GitHub Pages).

```
index.html   — markup & layout
styles.css   — all styling (both report themes, charts, responsive, print)
app.js       — state, autosave, history, charts, voice and rendering
```

## Development

There is nothing to install. To work on it locally:

```
python3 -m http.server 8000      # then open http://localhost:8000
```

The logic in `app.js` is plain ES5-style JavaScript with no framework. Pure helpers
(date math, metric deltas, CTR derivation, data migration) are exported under a Node
guard, so they can be unit-tested with `require('./app.js')`.

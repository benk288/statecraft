# Statecraft

A legislative tracker for a state public-policy practice. It shows which sports-betting and AI-regulation bills are alive in state legislatures, what each one does, who sponsors it, where clients stand, and drafts letters to sponsors.

It is a static website. There is no server and no database: bill data is baked into files under `data/`, and each user's positions, folders and documents stay in their own browser.

## Open it

```bash
npm run serve
```

Then visit http://localhost:8765. In the Claude desktop app, the preview named `statecraft` does the same thing.

## What's where

| Path | What it is |
|---|---|
| `index.html` | Page shell and all styling |
| `app.js` | The whole app: map, bill page, folders, compare, clients, letters |
| `data/` | Bill snapshot, AI summaries, headlines, sponsor records, session status |
| `scripts/` | Data pipeline: pull from LegiScan, summarise with Claude, build the site |
| `vendor/` | D3 and the US map, bundled so the site works offline |
| `v1/` | The original class-assignment version, kept untouched |
| `dist/` | The publishable site, built by `npm run dist` (not in git) |

## Update the data

These need API keys in your shell, never in a file. Ask Ben for them.

```bash
LEGISCAN_KEY=... OPENSTATES_KEY=... node scripts/fetch_sessions.mjs
```

```bash
LEGISCAN_KEY=... ANTHROPIC_API_KEY=... npm run refresh
```

`fetch_sessions` checks which legislatures are in session (one LegiScan request). `refresh` re-pulls only bills that changed, then writes summaries for new ones. LegiScan allows 10,000 requests a month; a refresh uses a few hundred at most.

## Publish

```bash
npm run dist
```

Drag the `dist/` folder onto the site in Netlify.

## Ground rules

- Real government data only. Nothing fictional, and no invented client names.
- AI summaries can be wrong. The official bill page is the authority.
- Not legal advice.

# Statecraft: notes for Claude

Statecraft is a legislative-intelligence site for Jeremy Kudon's state public-policy practice (sports betting, and AI regulation for the American Innovators Network). Ben Kudon built it; both of them edit it through Claude. Read README.md for layout and commands.

## What the user wants from the product

- Show what **moved**, not what was introduced. Order issues: tax rate, prediction markets, advertising, prop and college bets, sweepstakes, licensing.
- Default to bills that can still happen: legislatures in session, plus bills prefiled for the next session. Adjourned-session bills are dead and hidden unless asked for (the Showing menu). Session status lives in `data/sessions.js`.
- Sports betting and AI regulation are the topics that matter. iGaming and card breaks are secondary.
- Add capability without adding interface. The map stays the centerpiece. Plain language, no jargon.

## Hard rules

- Real data only. Never fabricate bills, sponsors, contributors, figures or client names. If the app lacks data, it says so rather than implying it has it.
- Never commit API keys. Scripts read `LEGISCAN_KEY`, `OPENSTATES_KEY` and `ANTHROPIC_API_KEY` from the environment. The in-browser letter drafter uses the key each user types into Settings, stored only in their browser.
- Watch cost. LegiScan is capped at 10,000 requests a month, so prefer `scripts/refresh.mjs` (optionally with `STATES=` and `YEARS=`) over a full `fetch_legiscan.mjs` pull. Claude scripts default to Sonnet; do not run `scripts/sponsor_money.mjs` (web search, about $0.25 per sponsor) without the user asking.
- Do not touch `v1/`.

## How the code is organised

- `app.js` is one vanilla-JS file with hash routes: `#/map`, `#/bill/<id>`, `#/folders/<id>`, `#/compare`, `#/clients/<id>`. Each screen is a `render…` function that rebuilds `#app` and then wires events. State is module-level variables; anything the user creates goes through `ws` and `persist()` into localStorage, with uploaded files in IndexedDB.
- Bill ids are `ST-NUMBER` (for example `NJ-A4002`), with a `~year` suffix when the same number recurs across sessions.
- `movement(b)` decides what counts as moved. `scripts/movement.mjs` has the same logic for the pipeline; keep the two in step.
- Data files come in pairs: `x.json` for scripts and `x.js` (a `window.STATECRAFT_…` global) for the page. Scripts skip work already done, so they are safe to re-run after an interruption.

## Before you say a change is done

Start the `statecraft` preview, reload, check the browser console for errors, and exercise the screen you changed. Then run `npm run dist` so the publishable folder matches.

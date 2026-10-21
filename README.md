# Cricket Manager (working title)

Mobile-first cricket career management sim, played in the browser. See `TODO.md` for the plan and status.

## Commands

- `npm run dev` start the dev server
- `npm run build` typecheck and build (with PWA)
- `npm run preview` serve the production build (add `-- --host` to open it on a phone on the same Wi-Fi)
- `npm test` run Vitest (sim, data, save and filter tests)
- `npm run lint`, `npm run typecheck`, `npm run format`
- `npm run data` regenerate `src/data/players.json` and `teams.json` from `scripts/source/`
- `npm run calibrate` simulate 10,000 matches and compare with real IPL numbers
- `npm run winprob` rebuild the win-probability table (after any change to the ball model)

## Layout

- `src/sim` pure TypeScript (no React/DOM; enforced by ESLint): match engine, season, market, news
- `src/ui` screens and components; `src/ui/kit` shared pieces; `src/ui/identity` crests and avatars
- `src/match3d` the stadium view (three.js, lazy-loaded) and its 2D fallback
- `src/state` the store, saves (versioned, with migrations) and storage
- `src/data` generated player and team data (see `src/data/README.md`)
- `scripts` data generators and the Cricsheet importers

## Data and credits

Player squads come from Wikipedia's IPL 2026 season pages; ratings are our own model built from [Cricsheet](https://cricsheet.org) ball-by-ball data (Open Data Commons Attribution License). Team names, crests and avatars are our own. See `src/data/README.md` for details and limits.

# Cricket Manager (working title) — v1 TODO

Mobile-first career-mode cricket management sim, played in the browser. League is IPL-style: real player names; franchises based on the real teams with one word of each name changed; own crests and avatars (no real logos). Prototype for testing, client pitching and phone-user feedback.

## Decisions so far
- **Stack:** React 19 (pinned `~19.3` to stay in `@react-three/fiber` v9's peer range), TypeScript (strict), Vite. Client-side only, no backend. Deploy on Vercel.
- **3D:** three.js for the match screen only, lazy-loaded. v1 uses a top-down orthographic camera only (no tilted broadcast camera).
- **Storage:** `localStorage` for saves (versioned, with JSON export/import).
- **Mobile-first:** design for 360–430 px wide; on desktop show a centered phone-width column. Installable as a PWA.
- **Names and art:** real player names only; no fictional or generated names. Stats and ratings are generated. Team names are the real franchises with one word changed (e.g. Sunrisers Hyderabad -> Sunrisers Falcons). Crests and avatars are our own procedural SVG; no real logos. Photos deferred.
- **UI look:** own layout and visual identity. Palette direction from the approved mockups (charcoal, periwinkle blue, green for money, amber for warnings). Procedural face avatars in our own layered SVG style. Radial hub home in our own style (own icons, procedural crest; no mascot art). Font: Barlow Semi Condensed.
- **Scope v1:** manager career mode. One league (10 teams), no promotion or relegation.
- **Deferred:** AI photos, training, youth academy, sponsors, stadium building, weather, DRS, loans, coin economy, backend and accounts, tilted/broadcast camera, image-based player portraits.

## Principles
- [x] Sim is pure TypeScript in `src/sim`. No React, no DOM, no `window`. UI and 3D only read its output.
- [x] One seeded RNG; the seed is stored in the save so any match or bug replays exactly.
- [x] Sim emits a stream of `BallEvent`s. Scoreboard, commentary and 3D view all consume the same stream.
- [x] All players and teams live in JSON data files, generated from `scripts/source/`.
- [x] No dates in this file. Sizes only: S (hours), M (a day or two), L (several days), XL (a week or more).

## Phase 0 — Project setup (S)
- [x] `npm create vite@latest` with the React + TypeScript template (moved from React 18 to 19 before Phase 1 so current R3F/drei work)
- [x] TypeScript `strict`, ESLint, Prettier
- [x] Vitest for sim tests
- [x] Zustand for game state (one store, plain serializable data)
- [x] React Router (hash or history with Vercel rewrites)
- [x] `vite-plugin-pwa`: manifest, icons, "Add to Home Screen"
- [ ] `vercel.json` SPA rewrite (done); connect repo; confirm a preview deploy
- [x] Folders: `src/sim`, `src/data`, `src/state`, `src/ui`, `src/match3d`, `src/theme`
- [ ] Test on at least two real phones from the first deploy

## Phase 1 — Data and identity (M)
- [x] Player schema: id, name, age, role, batting and bowling ratings, traits, overseas flag, contract
- [x] Players JSON: real names, generated ratings (documented in `src/data/README.md`; regenerate with `npm run data`)
- [x] 10 franchises: real team names with one word changed, own crests; colors loosely echo the real teams
- [x] SVG crest generator (seeded: shape + glyph + two colors)
- [x] SVG avatar generator: procedural face avatar, own style, one consistent look
  - [x] Layered parts: head shape, skin tone (6 to 8), hair style (about 10) and color, facial hair (about 5), eyebrows, kit collar in club colors, optional small club badge in the corner
  - [x] Seeded from player id so the same player always looks the same
  - [x] Style sheet: one stroke weight, flat fills, 3 shades per skin tone
  - [x] Ring wrapper that shows form/fitness (green, amber, red) around the avatar
  - [x] Slot to swap in an image URL later (AI portraits deferred)
  - [x] Check: render 100 random avatars on one page and confirm they do not look repetitive
- [ ] Short legal check before any public pitch: real names, any IPL wording, any logos
- [x] Hand-set traits for well-known real players (about 80, `scripts/source/known-traits.ts`)

## Phase 2 — Core engine (M)
- [x] Seeded PRNG module with tests (same seed, same sequence) — `src/sim/rng.ts`, done early for Phase 1
- [x] Calendar: weeks, match days, season rollover (`src/sim/calendar.ts`; 14 league rounds until the format decision)
- [x] Save schema with `version` field and migration function (`src/state/save.ts`)
- [x] Save/load to `localStorage`; wrap in try/catch; handle empty or full storage; damaged saves kept aside (`src/state/storage.ts`)
- [x] JSON export and import (file download and paste/upload) — in Settings
- [x] Size budget: store squads, finances, standings, match summaries only. Ball-by-ball data lives in memory for the current match (new career is about 60 KB; test caps it at 250 KB)
- [ ] Consider IndexedDB later if saves outgrow ~5 MB
- [x] Minimal new-career flow (pick club, manager name) and club screen with Continue and squad list (full player names), so saves have something to hold; Phase 9/10 replace them

## Phase 3 — Player model (M)
- [x] Ratings: batting, bowling (pace/spin), fielding, plus `potential` (growth ceiling)
- [x] Age curve (growth, prime, decline), applied at season rollover with a seeded RNG per player and season
- [x] Fitness and form model (`src/sim/player.ts`): match load, daily recovery, form towards grades, idle drift; `effectiveRating`. Wiring to real matches is Phase 6
- [x] 3 to 5 traits (e.g. finisher, powerplay specialist, death bowler, poor vs spin, big hitter) — 6 traits in `src/data/types.ts`; their sim effects come in Phase 4
- [x] Overall rating function
- [x] Unit tests for age curve and rating bounds

## Phase 4 — Ball-by-ball sim and calibration (XL, riskiest piece)
- [x] `BallEvent` type: over, ball, batter, bowler, runs, extras, wicket, dismissal, shot direction and distance, boundary flag, commentary key
- [x] `simBall(state, rng)` — batter vs bowler, phase (powerplay, middle, death), pitch, form, fitness, aggression
- [x] `simOver`, `simOvers(n)` (e.g. 5 overs), `simInnings`, `simMatch`, all built on `simBall`
- [x] Rules: wides, no-balls, free hit, extras, wickets, innings end, target and chase, super over (repeats on a tie)
- [x] Calibration harness: run 10,000 simulated matches and compare to real IPL numbers (`npm run calibrate`, 1.5 s; results in `src/sim/calibration/README.md`)
  - [x] Source data: Cricsheet ball-by-ball, 2024–2026 (ODC-By licence: attribution given; only aggregates committed)
  - [x] Targets: runs per over, first-innings total distribution, wickets per innings, boundary %, dot-ball %, powerplay vs death scoring, chase win %
  - [x] Tune until simulated ranges match; keep the harness as a test (all metrics within about 2%)
- [x] Deterministic replay test: same seed gives the same match, whatever the stepping (ball, over, innings)

## Phase 5 — Match inputs (M)
- [x] Playing XI selection (with auto-pick and validation) — engine side; the pick screen is Phase 10
- [x] Batting order
- [x] Bowler over allocation (max 4 overs, no back-to-back; manager plan or AI; auto plan as a starting point)
- [x] Batting aggression setting: 5 levels (defend, rotate, balanced, attack, all-out), team default plus per-batter, changeable live
- [x] Opposition AI: picks XI, orders and bowlers; reads the chase for intent
- [x] Overseas limit in the XI (max 4)
- [ ] Impact player substitute (real IPL rule since 2023) — decide whether v1 needs it

## Phase 6 — Post-match step (M)
- [x] Batting and bowling grades per player
- [x] Rating growth or decline from grades, with caps (±1 per match, ±3 per skill per season, growth stops at potential)
- [x] Fitness drop and recovery
- [x] Injury roll (minor, serious, long-term) based on fitness and workload; matches-out counter
- [x] Form update
- [x] Save format v2 with migration from v1 (injuries, season development)
- [x] Call the post-match step from real fixtures

## Phase 7 — Contracts and squad (L)
- [x] Contract: cost, length, expiry (unrenewed contracts expire at the turn of the year; AI clubs keep most good players)
- [x] Salary purse (cap ₹140 cr); block signings over budget
- [x] Player willingness check (club strength, manager reputation, role in the XI, pay, contract length, form via asking price)
- [x] Basic negotiation: offer, counter, accept or decline; walks away after 3 rounds; renewals use the same talks
- [x] Free-agent market; AI clubs restock at the turn of the year (needs first, then one upgrade)
- [x] Trades between clubs, 1-for-1 in the UI (engine allows more); AI wants 5% more value (loans deferred)
- [x] Retirements (long T20 careers; fading players go sooner)
- [ ] Season pool: new real players added through data updates (no generated names). The real squads plus 73 free agents last longer; still needs a decision (see Risks)
- [x] Overseas player rules (max 8 in squad, 4 in the XI); squad size 18–25
- [x] Safety nets: manager keeps 11 if contracts lapse, emergency signings, short sides, walkovers
- [x] Market screen: free agents, my squad (renew/release), trade, transfer log

## Phase 8 — League (M)
- [x] 10 teams; fixture generator: 14 matches each (every pair once, five rounds replayed home/away swapped, no back-to-back rematches)
- [x] Standings: points, net run rate (all out = 20 overs; walkovers count points only)
- [x] Playoffs: Qualifier 1, Eliminator, Qualifier 2, Final
- [x] Sim other teams' matches quickly (same engine, no UI; a whole season takes well under a second)
- [x] Season end: awards (Orange Cap, Purple Cap, MVP, Emerging), contracts expiring, rollover, history
- [x] Play your match live (intent control) or quick-sim it; Continue plays the rest of the round
- [x] Table screen: standings, playoffs, your fixtures and results

## Phase 9 — Career layer (S–M)
- [x] Reputation (moves with finish, trophies and objectives; makes players keener to sign)
- [x] Board objectives from squad strength, with live progress on the club screen
- [x] Sack condition (board confidence below 25 after a season review) and game-over screen
- [x] New career setup: choose club (sorted by squad strength, with the board's expectation), manager name

## Phase 10 — Mobile UI (L)
- [x] Design tokens in `src/theme` (colors, type scale, spacing, radii)
- [x] Layout shell: top bar (purse, reputation), content, bottom action bar; safe-area insets
- [ ] Touch targets at least 48 px; text contrast at least 4.5:1 (not verified yet; filter chips are 36 px)
- [x] Shared components (reference direction from screenshots; own look, no copied art or icons):
  - [x] `Card`, `Button` (primary, secondary, danger), `Chip` (role, trait, e.g. "Specialist chasing")
  - [x] `RatingRing` (number inside, color by rating band), `StatBar` (segmented; also used for aggression)
  - [x] `Avatar` (from Phase 1), `TopBar` (purse in green, reputation), `NewsTicker` for the welcome/news line
  - [x] `BottomActionBar`: Back plus a primary action with a slanted edge (e.g. Play Match)
- [x] Screens:
  - [x] Club home: top bar (manager, purse, reputation), news ticker, Board / Finances / Club sheets, radial hub (Market, Statistics, Fixtures, Pick XI, Table, Squad) around the crest with red attention dots, Standings / Calendar / Alerts tiles, slanted Play Match / Continue bar. Deferred features are not shown
  - [x] Squad list and market list: row = avatar, name, nationality marker, role label, trait chips, rating ring, captain/overseas marker; sort and filter by role, overseas, fitness; virtualize if over 50 rows
  - [x] Player detail sheet: ratings, traits, form, fitness, contract
  - [x] Pick XI and batting order: tap-to-swap (drag optional), overseas counter, auto-pick button
  - [x] Match screen (see Phase 11)
  - [x] Post-match summary: result, player grades with rating changes, injuries
  - [x] Market and contract negotiation
  - [x] Standings
  - [x] Calendar
  - [x] Finances
  - [x] Settings (save, export, import, reset)
- [x] Debug page for the sim: pick teams, next ball / over / 5 overs / innings / match, live intent, commentary, scorecards, grades, apply to career
- [x] Desktop: centered phone-width column
- [x] Respect `prefers-reduced-motion`

## Phase 11 — 3D match screen with three.js (XL)
Reference direction (from the uploaded screenshots): scoreboard card on top, the field fills the screen from above, last six balls over the field, batter controls docked at the bottom, a shot arc and a big run popup. Take the layout idea only. Do not copy its stadium art, crowd, logos, ad boards, icons or typography.
- [ ] Spike first (S): measure fps on a low-end Android (only tested in desktop headless Chrome so far)
- [x] Install `three`, `@react-three/fiber` v9 and `@react-three/drei` v10 (React 19)
- [x] Use a few `drei` helpers only (Line, OrthographicCamera); 3D chunk is lazy (250 KB gzip), main app 127 KB gzip
- [x] Lazy-load the match chunk (`React.lazy`) so the rest of the app stays small
- [x] Layout (DOM over canvas):
  - [x] Top scorebug card: competition and venue, big score and overs, target and required rate, last-ball commentary, team crests left and right
  - [x] Six-ball strip with colored chips (boundary, dot, wicket)
  - [x] Bottom panel: batting rows (avatar, name, runs (balls), info button, aggression `-` bar `+` with label), bowling row, sim buttons
- [x] Scene:
  - [x] Orthographic top-down camera
  - [x] Striped mowing pattern (shader or canvas texture), boundary rope and cream boundary band, dashed 30-yard circle, pitch strip with crease lines
  - [x] 11 fielders, 2 batters and the bowler as flat discs (instanced), team colors; positions come from the field setup
  - [x] Procedural stand ring with instanced crowd dots in several colors
  - [x] Floodlight clusters in the corners with soft light-cone sprites
  - [x] Own ad-board placeholders near the rope ("YOUR SPONSOR HERE")
- [x] Animation driven by `BallEvent`: ball travel, yellow shot arc, rope highlight on boundaries, big "4", "6" or "OUT!" popup, nearest fielder chases
- [ ] Crowd flash on a six
- [x] `prefers-reduced-motion`: no animation, show the result instantly
- [x] Field settings: phase presets (powerplay 2 out, middle 5 out, death 5 out) for the view
- [ ] Let field settings also affect the sim (catches, boundaries saved)
- [x] Aggression controls: per-batter setting (defend, rotate, balanced, loft, all-out) passed into `simBall`; changes apply from the next ball
- [x] Sim buttons: Next ball, Sim over, Sim 5 overs, Sim innings (skips animation and shows result)
- [x] Performance: no real-time shadows, device pixel ratio capped at 2, instanced meshes, crowd in one draw call, textures 1024 px or smaller, dispose geometries on unmount, target 30+ fps on a mid-range Android phone
- [x] Fallback: a 2D SVG field renderer using the same `BallEvent` stream; switch automatically when WebGL fails or fps stays under 25 for 3 seconds
- [ ] Test on a low-end phone before polishing

## Phase 12 — QA and feedback (M)
- [x] Sim tests: determinism, bounds, rules (overs, wickets, targets)
- [x] Save tests: round-trip, migration, corrupted save recovery
- [ ] Manual test pass on iOS Safari and Android Chrome
- [ ] In-app "Send feedback" link (a form or mailto); no analytics backend
- [ ] Local-only error log that testers can copy into feedback
- [x] "Prototype" label and build version shown in Settings
- [x] Screenshot check of the match field at 360 and 390 px wide (headless Chrome); [ ] 430 px
- [ ] Contrast check of rating rings and chips
- [ ] Log fps samples in the local error log

## Phase 13 — Deploy and pitch (S)
- [ ] Vercel production deploy and a stable URL
- [ ] Changelog and known-issues page
- [ ] Short demo script: new career, pick XI, sim a match, sign a player, play a season

## Feedback round 1 (done)
- [x] Negotiation: agent personalities (keen / fair / tough, hidden reservation, varied patience); counters meet you halfway
- [x] Player sheet: season and career numbers (runs, avg, SR, HS, wickets, economy), morale, skills explained
- [x] Hard innings stop: sim buttons never cross into the next innings; innings-break card
- [x] Pick XI redesigned as a compact team sheet (tap to select, tap to swap, action strip)
- [x] Bowling controls when you field: choose the bowler each over, field (attacking/balanced/defensive), bowler intent (contain/balanced/attack), plan (stock/yorkers/bouncers/wide line/variations); all affect the sim; field view follows the setting
- [x] More skills (batting: spin basher, pace hitter, powerplay hitter; bowling: yorker specialist, swing, mystery spin, bouncer, economical) with sim effects; hand-set for ~80 well-known players
- [x] Form carries half into the next season and is worth about ±6; playing time grows young players (season cap 4)
- [x] Smarter AI: rests worn-out players, sets bowling tactics by phase and situation, trades with other AI clubs, sends you trade offers
- [x] News centre (My club / League): results, milestones, injuries, transfers, trades, offers to accept, unhappy players to talk to, social-media drama, rumours
- [x] Morale: drops when a regular is left out or underpaid; affects form and renewals
- [x] Calibration re-tuned with AI tactics in play (all within about 2–4%)
- [ ] Mid-season AI trades (currently only in the windows; mid-season has rumours)

## Real squads, filters and the Timeline UI (done)
- [x] Real IPL 2026 squads (23–25 per club) from Wikipedia season pages, real auction salaries, withdrawn/unsold players as free agents
- [x] Ratings from real performance (Cricsheet 2023+: average, strike rate, economy, wickets per over), shrunk towards a salary prior for small samples; roles from real usage
- [x] Market filters: search, role, nationality, bowling, age, rating, skill, price, availability, sort, reset; League tab to browse other clubs' players; same bar on the Squad screen
- [x] Mockup H integrated: Timeline club home (progress bar, results, Today card, upcoming, Menu sheet) and Pick XI on a field diagram
- [x] Repo ignore rules (`.claude`, `.code-review-graph`, `.design-directions`, `.env*`, `*.tsbuildinfo`)
- [ ] Re-check a few players against the official IPL site before a public pitch (see `src/data/README.md`)
- [ ] Other mockups (F, G, I, J) not used; more design rounds later

## Open decisions
- [x] League format: 14 matches each (IPL style). Revisit if needed
- [ ] Game name; final franchise names (current ones are a first pass)
- [ ] Final palette and fonts (from the mockups)
- [ ] Salary cap size (₹140 cr for now; real squads start at ₹88–123 cr)
- [ ] How many seasons a career runs, and what "winning" means
- [ ] Whether to add an auction instead of a free-agent market
- [ ] Nationality marker: own simple flag glyphs or a country-code chip
- [ ] Aggression levels and their exact effect on the sim
- [ ] Font choice (a condensed sans for the scorebug)
- [ ] Where new players come from each season (see Risks: shrinking pool)
- [ ] Release costs (currently free) and mid-season injury replacements

## Risks
- Sim calibration: believable results take iteration. Plan for it, do not assume it works first time.
- `localStorage` limits and browser clearing. Export/import is the safety net.
- Three.js performance on low-end phones. The 2D fallback is the insurance.
- Real player names and near-real team names without a license. Get the legal check done before any public pitch.
- Crowd and stand visuals cost performance. Keep them instanced and simple.
- Avatars can look repetitive. Needs enough part combinations and the 100-avatar check.
- **Shrinking player pool.** Real names only and no youth intake: about 10–15 players retire each year. Squads stay full for about three seasons, then free agents run out and weaker clubs shrink (safety nets keep matches playable). Needs one of: a yearly real-player data update, an academy with generated players, or smaller squads.
- Scope creep from the deferred list. Resist until v1 is playable end to end.
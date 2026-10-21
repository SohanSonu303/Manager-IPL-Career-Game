# Cricket Manager (working title) — v1 TODO

Mobile-first career-mode cricket management sim, played in the browser. League is IPL-style but fully fictional (teams, logos, avatars). Prototype for testing, client pitching and phone-user feedback.

## Decisions so far
- **Stack:** React 18, TypeScript (strict), Vite. Client-side only, no backend. Deploy on Vercel.
- **3D:** three.js for the match screen only, lazy-loaded.
- **Storage:** `localStorage` for saves (versioned, with JSON export/import).
- **Mobile-first:** design for 360–430 px wide; on desktop show a centered phone-width column. Installable as a PWA.
- **Names and art:** real player names only (public). Stats and ratings are generated. Teams, crests and avatars are fictional and procedural (SVG). Photos deferred.
- **UI look:** own layout and visual identity. Palette direction from the approved mockups (charcoal, periwinkle blue, green for money, amber for warnings). No radial hub, no mascot crests, no cartoon busts.
- **Scope v1:** manager career mode. One league (10 teams), no promotion or relegation.
- **Deferred:** AI photos, training, youth academy, sponsors, stadium building, weather, DRS, loans, coin economy, backend and accounts.

## Principles
- [ ] Sim is pure TypeScript in `src/sim`. No React, no DOM, no `window`. UI and 3D only read its output.
- [ ] One seeded RNG; the seed is stored in the save so any match or bug replays exactly.
- [ ] Sim emits a stream of `BallEvent`s. Scoreboard, commentary and 3D view all consume the same stream.
- [ ] All players and teams live in JSON data files, so names can be swapped (fictional-names toggle).
- [ ] No dates in this file. Sizes only: S (hours), M (a day or two), L (several days), XL (a week or more).

## Phase 0 — Project setup (S)
- [x] `npm create vite@latest` with the React + TypeScript template; pin React 18
- [x] TypeScript `strict`, ESLint, Prettier
- [x] Vitest for sim tests
- [x] Zustand for game state (one store, plain serializable data)
- [x] React Router (hash or history with Vercel rewrites)
- [x] `vite-plugin-pwa`: manifest, icons, "Add to Home Screen"
- [ ] `vercel.json` SPA rewrite (done); connect repo; confirm a preview deploy
- [x] Folders: `src/sim`, `src/data`, `src/state`, `src/ui`, `src/match3d`, `src/theme`
- [ ] Test on at least two real phones from the first deploy

## Phase 1 — Data and identity (M)
- [ ] Player schema: id, name, age, role, batting and bowling ratings, traits, overseas flag, contract
- [ ] Players JSON: real names, generated ratings (document how they were generated)
- [ ] 10 fictional franchises: city + original nickname, own colors (not matching real team palettes)
- [ ] Fictional-names toggle for players (for public pitches)
- [ ] SVG crest generator (seeded: shape + glyph + two colors)
- [ ] SVG avatar generator (initials and kit color, or faceless silhouette; one consistent style)
- [ ] Short legal check before any public pitch: real names, any IPL wording, any logos

## Phase 2 — Core engine (M)
- [ ] Seeded PRNG module with tests (same seed, same sequence)
- [ ] Calendar: weeks, match days, season rollover
- [ ] Save schema with `version` field and migration function
- [ ] Save/load to `localStorage`; wrap in try/catch; handle empty or full storage
- [ ] JSON export and import (file download and paste/upload)
- [ ] Size budget: store squads, finances, standings, match summaries only. Ball-by-ball data lives in memory for the current match
- [ ] Consider IndexedDB later if saves outgrow ~5 MB

## Phase 3 — Player model (M)
- [ ] Ratings: batting, bowling (pace/spin), fielding
- [ ] Age curve (growth, prime, decline)
- [ ] Fitness and form (both change with matches)
- [ ] 3 to 5 traits (e.g. finisher, powerplay specialist, death bowler, poor vs spin, big hitter)
- [ ] Overall rating function
- [ ] Unit tests for age curve and rating bounds

## Phase 4 — Ball-by-ball sim and calibration (XL, riskiest piece)
- [ ] `BallEvent` type: over, ball, batter, bowler, runs, extras, wicket, dismissal, shot direction and distance, boundary flag, commentary key
- [ ] `simBall(state, rng)` — batter vs bowler, phase (powerplay, middle, death), pitch, form, fitness, aggression
- [ ] `simOver`, `simOvers(n)` (e.g. 5 overs), `simInnings`, `simMatch`, all built on `simBall`
- [ ] Rules: wides, no-balls, free hit, extras, wickets, innings end, target and chase, super over (can be last)
- [ ] Calibration harness: run 10,000 simulated matches and compare to real IPL numbers
  - [ ] Source data: Cricsheet ball-by-ball (check the license)
  - [ ] Targets: runs per over, first-innings total distribution, wickets per innings, boundary %, dot-ball %, powerplay vs death scoring, chase win %
  - [ ] Tune until simulated ranges match; keep the harness as a test
- [ ] Deterministic replay test: same seed gives the same match

## Phase 5 — Match inputs (M)
- [ ] Playing XI selection (with auto-pick)
- [ ] Batting order
- [ ] Bowler over allocation (rules: max overs per bowler)
- [ ] Batting aggression setting (safe, balanced, attack)
- [ ] Opposition AI: picks XI, orders and bowlers
- [ ] Overseas limit in the XI

## Phase 6 — Post-match step (M)
- [ ] Batting and bowling grades per player
- [ ] Rating growth or decline from grades, with caps
- [ ] Fitness drop and recovery
- [ ] Injury roll (minor, serious, long-term) based on fitness and workload; matches-out counter
- [ ] Form update

## Phase 7 — Contracts and squad (L)
- [ ] Contract: cost, length, expiry
- [ ] Salary purse (cap); block signings over budget
- [ ] Player willingness check (reputation, role, pay, form)
- [ ] Basic negotiation: offer, counter, accept or decline
- [ ] Free-agent market with refresh
- [ ] Trades between clubs (loans deferred)
- [ ] Season pool: generated young players each year, retirements
- [ ] Overseas player rules

## Phase 8 — League (M)
- [ ] 10 teams; fixture generator (decide format, see open decisions)
- [ ] Standings: points, net run rate
- [ ] Playoffs: Qualifier 1, Eliminator, Qualifier 2, Final
- [ ] Sim other teams' matches quickly (no event stream needed)
- [ ] Season end: awards, contracts expiring, rollover

## Phase 9 — Career layer (S–M)
- [ ] Reputation
- [ ] Board objectives (e.g. reach playoffs) with progress
- [ ] Sack condition and game-over screen
- [ ] New career setup: choose club, manager name

## Phase 10 — Mobile UI (L)
- [ ] Design tokens in `src/theme` (colors, type scale, spacing, radii)
- [ ] Layout shell: top bar (purse, reputation), content, bottom action bar; safe-area insets
- [ ] Touch targets at least 48 px; text contrast at least 4.5:1
- [ ] Screens:
  - [ ] Club home (card grid with status lines, next-match button)
  - [ ] Squad list with filters and player detail
  - [ ] Pick XI and batting order
  - [ ] Match screen (see Phase 11)
  - [ ] Post-match summary
  - [ ] Market and contract negotiation
  - [ ] Standings
  - [ ] Calendar
  - [ ] Finances
  - [ ] Settings (save, export, import, reset, fictional-names toggle)
- [ ] Debug page for the sim (one table, one "sim over" button) — build this before the real UI
- [ ] Desktop: centered phone-width column
- [ ] Respect `prefers-reduced-motion`

## Phase 11 — 3D match screen with three.js (XL)
Reference direction (from the uploaded screenshot): scoreboard card on top, the field fills the screen from above, last six balls over the field, batter controls docked at the bottom, a shot arc and a big run popup. Take the layout idea only. Do not copy its stadium art, crowd, logos, ad boards or typography.
- [ ] Use `three` with `@react-three/fiber` v8 (v9 needs React 19) and a few `drei` helpers
- [ ] Lazy-load the match chunk (`React.lazy`) so the rest of the app stays small
- [ ] Orthographic top-down camera; field, boundary rope, 30-yard circle, pitch strip
- [ ] 11 fielder markers and 2 batters (instanced meshes); positions come from the field setup
- [ ] Ball and shot arc driven by `BallEvent` (direction, distance, boundary); big run or wicket popup
- [ ] Stands as a procedural ring with instanced crowd dots; two simple floodlight cones
- [ ] Own look: own colors, own ad-board placeholders ("YOUR SPONSOR HERE")
- [ ] DOM overlay for the HUD: scorebug, last 6 balls, batter cards with aggression control, sim buttons
- [ ] Sim buttons: Next ball, Sim over, Sim 5 overs, Sim innings (skips animation and shows result)
- [ ] Performance: no real-time shadows, cap device pixel ratio at 2, target 30+ fps on a mid-range Android phone, dispose geometries on unmount
- [ ] Fallback: a 2D SVG field renderer using the same `BallEvent` stream (also helps low-end phones and WebGL failures)
- [ ] Test on a low-end phone before polishing

## Phase 12 — QA and feedback (M)
- [ ] Sim tests: determinism, bounds, rules (overs, wickets, targets)
- [ ] Save tests: round-trip, migration, corrupted save recovery
- [ ] Manual test pass on iOS Safari and Android Chrome
- [ ] In-app "Send feedback" link (a form or mailto); no analytics backend
- [ ] Local-only error log that testers can copy into feedback
- [ ] "Prototype" banner and build version shown in Settings

## Phase 13 — Deploy and pitch (S)
- [ ] Vercel production deploy and a stable URL
- [ ] Changelog and known-issues page
- [ ] Pitch build: fictional-names toggle on, no real names visible
- [ ] Short demo script: new career, pick XI, sim a match, sign a player, play a season

## Open decisions
- [ ] League format: double round-robin (18 matches each) or a custom 14-match schedule
- [ ] Game name and fictional franchise names
- [ ] Final palette and fonts (from the mockups)
- [ ] Salary cap size and starting budget
- [ ] How many seasons a career runs, and what "winning" means
- [ ] Whether to add an auction instead of a free-agent market

## Risks
- Sim calibration: believable results take iteration. Plan for it, do not assume it works first time.
- `localStorage` limits and browser clearing. Export/import is the safety net.
- Three.js performance on low-end phones. The 2D fallback is the insurance.
- Real player names without a license. Keep the data swappable.
- Scope creep from the deferred list. Resist until v1 is playable end to end.
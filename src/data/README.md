# Game data

`players.json` and `teams.json` are **generated**. Do not edit them by hand: edit the sources in `scripts/source/` and run `npm run data`. The generator is deterministic (fixed seed `20261`), so the same sources always give the same output. `data.test.ts` checks the result.

| File | What it is |
| --- | --- |
| `types.ts` | Schemas: `Player`, `Team`, `CrestSpec`, roles, traits, nationalities |
| `players.json` | 215 players: 165 real, 50 generated |
| `teams.json` | 10 fictional franchises with colors and crest specs |
| `name-pools.json` | First/last name pools per nationality (fictional-names toggle, generated players) |
| `names.ts` | `displayName` (toggle-aware), `fictionalName`, `shortName` |

## Real players: what is real and what is not

`scripts/source/real-players.ts` holds only public facts plus rough judgement: **name, nationality, role, bowling type (pace/spin), a tier from 1 (fringe) to 5 (elite) and an approximate birth year**. No real statistics are used. Ratings, traits and contracts are generated, as described below. Ages are approximate as of the 2026 start season.

## How ratings are generated (`scripts/generate-data.ts`)

1. **Main skill** = tier mean (`1: 50, 2: 58, 3: 66, 4: 74, 5: 82`) plus noise (sd about 4).
2. **By role:**
   - Batter: batting = main skill. Bowling is part-time (12–35).
   - Wicketkeeper: batting = main skill − 1. Bowling 3–12. Fielding +6 (keeping).
   - Bowler: bowling = main skill. Batting 12–38.
   - All-rounder: both skills = main skill − 5, with a random lean (sd 5) towards one of them.
3. **Fielding** is 52–84, minus 1.5 per year over age 32.
4. Every rating is clamped to 1–99.
5. **Traits** (0–2 per player):
   - Batters rated 62+ may get one of `big-hitter`, `anchor` or `finisher`.
   - Batters rated under 72 have a 15% chance of `poor-vs-spin`.
   - Pace bowlers rated 60+ may get `death-bowler` or `powerplay-specialist`.
   - Traits are random within those rules, so they will not match a real player's reputation.
6. **Overall rating:** `overallRating` in `src/sim/player.ts`, weighted by role.
7. **Salary (lakhs per year)** = `max(20, ((overall − 40) / 45)^2.2 × 1800)`, rounded to 5. Contract length is 1–3 years.

## Generated players

There are 50 generated Indian players, aged 18–24 and in tiers 1–2. Their names come from `name-pools.json` and are checked against the real names so they never match one. These are marked `real: false`.

## Squads

The squads come from a balanced snake draft (best available player by overall rating). It works under these rules:
- 18 players per squad.
- At most 6 overseas players per squad during the draft. The league rule of at most 8 comes later, in Phase 7.
- Each squad has exactly 2 keepers, at least 4 batters, at least 3 all-rounders and at least 5 bowlers.
- Each squad has at least 4 pace and at least 3 spin options.

Leftover players become free agents (`teamId: null`, `contract: null`).

## Ids

Player ids are `p` + a base-36 hash of the source name. They never contain a real name, so URLs and saves stay clean when the fictional-names toggle is on.

## Teams

The franchise names are placeholders (see "Open decisions" in `TODO.md`). They use cities without a real franchise, and each color pair differs from every real league palette. Each crest is a seeded, unique combination of shape and glyph.

# Game data

`players.json` and `teams.json` are **generated**. Do not edit them by hand: edit the sources in `scripts/source/` and run `npm run data`. The generator is deterministic (fixed seed), so the same sources always give the same output. `data.test.ts` checks the result.

| File | What it is |
| --- | --- |
| `types.ts` | Schemas: `Player`, `Team`, `CrestSpec`, roles, skills (traits), nationalities |
| `players.json` | About 320 real players: 10 squads of 23–25, plus a free-agent pool |
| `teams.json` | 10 franchises (real league names with one word changed), colours and crest specs |
| `names.ts` | `shortName` ("Virat Kohli" -> "V Kohli") |

## Where the data comes from

| Source file | Contents |
| --- | --- |
| `scripts/source/rosters.txt` | The IPL 2026 squads (who plays for whom), from the Wikipedia "2026 <franchise> season" pages: name, nationality, birth date, bowling style, real auction salary, keeper flag, replacements and withdrawn players |
| `scripts/source/player-stats.json` | Per-player aggregates since 2023 (runs, balls, outs, balls bowled, runs conceded, wickets, stumpings) built from [Cricsheet](https://cricsheet.org) ball-by-ball data (Open Data Commons Attribution License) by `scripts/cricsheet-players.ts` |
| `scripts/source/real-players.ts` | An older hand list: a role and a rough tier for players it knows, and extra free agents |
| `scripts/source/known-traits.ts` | Hand-set skills for about 80 well-known players |
| `scripts/source/teams.ts` | The ten franchises: names, colours, crest glyphs, grounds |

To refresh the stats, download `https://cricsheet.org/downloads/ipl_json.zip`, unzip it, and run `npx tsx scripts/cricsheet-players.ts <dir> 2023`. To change a squad, edit `rosters.txt`.

## How a player is built (`scripts/generate-data.ts`)

1. **Club, age, salary:** from the roster. Salary is the real auction price (crore to lakh). Contract length is random, 1–3 seasons. Withdrawn and unsold players have no club and become free agents. Players on the older hand list who are on no 2026 roster are free agents too.
2. **Role:** wicketkeeper if flagged (or he has stumpings); otherwise from real usage: bowls 20+ overs and bats a lot = all-rounder, bowls a lot = bowler, bats a lot = batter. Players with no IPL record fall back to the older list, or all-rounder if they have a bowling style.
3. **Batting rating:** from real average and strike rate against the league norm (`68 + 30 × (score − 1)`), blended with a prior by balls faced (`balls / (balls + 250)`). The prior comes from salary (and the older tier where known), so uncapped players with no data are rated from what the franchise paid.
4. **Bowling rating:** from economy and wickets per over (`66 + 0.75 × score`), blended by balls bowled (`/ (bowled + 150)`).
5. **Fielding:** seeded random 52–84, lower with age, higher for keepers.
6. **Potential:** overall plus room by age (more room when young). Season development stops at it.
7. **Skills:** hand-set for known players, otherwise generated from role and ratings (up to two).
8. **Ids:** `p` + a base-36 hash of the name.

## Honest limits

- Ratings are **our own model** of recent real performance, not official ratings. A rating moves with a small sample, so uncapped and returning players are shrunk towards their salary-based prior.
- The roster tables were read from Wikipedia on the day they were fetched; in-season replacements and withdrawals change over time. **Lungi Ngidi** (DC) was added by hand because the fetched table left him out, and **Mangesh Yadav**'s birth year was corrected (the page had a typo). Spot-check a few players against the official IPL site before showing the game publicly.
- 36 players have no Cricsheet record (mostly new uncapped players, or players who have not played in 2023–2026). Their roles are inferred and their ratings come from the prior only.
- Squads are not forced to be balanced: they are the real squads, so some teams are stronger than others.

## Teams

The franchises follow the real league's teams. Each keeps most of the real name with one word changed (for example, Sunrisers Hyderabad becomes Sunrisers Falcons). Colours loosely echo the real teams. Crests are our own seeded shape and glyph designs, not real logos.

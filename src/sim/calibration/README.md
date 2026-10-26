# Sim calibration

The ball-by-ball sim is tuned so that AI-vs-AI matches between the real squads look like real IPL cricket.

- **Targets:** `targets.json` holds aggregates from IPL ball-by-ball data for the 2024, 2025 and 2026 seasons (213 full 20-over matches). The data comes from [Cricsheet](https://cricsheet.org), used under the Open Data Commons Attribution License. Only aggregates are stored here, not the raw data. To regenerate it, run `npx tsx scripts/cricsheet-targets.ts <unzipped ipl_json dir> 2024`.
- **Model constants:** `MODEL` in `src/sim/match/model.ts` holds the per-phase base rates, the skill and intent sensitivity, extras and the dismissal mix. It also holds the engine v2 effects:
  - getting set (new batters are at more risk);
  - dot-ball pressure;
  - bowler fatigue over a long spell;
  - a rattled bowler after boundaries;
  - dropped catches and misfields.

  These effects spread outcomes, so the base rates were retuned to keep the averages.

  Slices 3–4 added more:
  - the delivery model (`delivery.ts`: intended vs executed length);
  - dew in the second innings;
  - DRS reviews and turned-down appeals;
  - the Impact Player, used by the AI at the innings break;
  - strategic timeouts;
  - AI captains naming their XI after the toss.

  Round 2 added match-situation effects (`situationFactor` and `bowlerPenalty` in `model.ts`), with the base wicket and boundary rates retuned around them:
  - a set batter "in the zone" (25+ off 20+ balls) scores more freely and safely; past 60 the risk creeps back;
  - a 30-run stand settles the batting side, and a new pair is fragile for its first six balls;
  - a bowler gains confidence from his wickets, and carries a bad over (15+) into his next;
  - chase pressure: wicket risk rises with the required rate above 9 an over (capped);
  - heavy dew hurts spinners' grip (more boundaries off spin);
  - short boundaries give more sixes, big grounds fewer;
  - tail-enders (batting under 35) are extra vulnerable to a real bowler;
  - a very unhappy player (morale under 30) plays 2 rating points down;
  - form counts more (±10 rating at the extremes) plus a hot/cold streak (±1.5 a step).

  The real targets already include the Impact Player era (2024+). Because DRS adds lbws and drops remove catches, the model's dismissal mix sets caught higher and lbw lower than the real one; the simulated mix comes out close to real.

- **Known gaps:**
  - First-innings totals run about 3 runs low on average and the 90th percentile about 7 low.
  - Hat-tricks (about 9% of matches) and five-wicket hauls (about 0.11 per match) are more common than in real IPL. This was already true before engine v2: wickets cluster when tail-enders arrive together.

- **Harness:** `harness.ts` plays N matches between random pairs of the 10 squads.
  - `npm run calibrate` runs 10,000 matches and prints the table below (about 2.5 s), plus drops and misfields per match.
  - `calibration.test.ts` runs 3,000 matches with tolerances, so a model change that breaks realism fails the test suite.
- **Win probability:** `npm run winprob` rebuilds `src/sim/match/winprob.json`. The table holds the mean and spread of the runs still to come from each (balls left, wickets) state, measured over 20,000 simulated innings. `winProb.ts` reads it. Rebuild it after any model change.

## Latest run (10,000 matches)

```
metric                     real      sim     diff
run rate                    9.7     9.73    0.030
RR powerplay               9.76     9.75   -0.010
RR middle                  9.05     9.18    0.130
RR death                     11    11.06    0.060
wkt/ball powerplay       0.0431   0.0435    0.000
wkt/ball middle          0.0465   0.0468    0.000
wkt/ball death           0.0819   0.0856    0.004
dot %                     0.274    0.269   -0.005
single %                  0.381    0.379   -0.002
two %                     0.059    0.059    0.000
four %                    0.136    0.139    0.003
six %                      0.08     0.08    0.000
wides / inns               5.99     5.91   -0.080
no-balls / inns            0.47     0.47    0.000
leg-byes / inns             1.9     1.84   -0.060
1st inns mean             191.9    188.5   -3.400
1st inns sd                37.4     36.5   -0.900
1st inns p10                147      140   -7.000
1st inns p50                195      192   -3.000
1st inns p90                238      231   -7.000
wickets / inns             6.08     5.84   -0.240
chase win %               0.555    0.534   -0.021
```

Ties come out at about the real rate (2 in 213 real matches is too small a sample to tune against).

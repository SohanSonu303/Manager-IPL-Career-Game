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

- **Harness:** `harness.ts` plays N matches between random pairs of the 10 squads.
  - `npm run calibrate` runs 10,000 matches and prints the table below (about 2.5 s), plus drops and misfields per match.
  - `calibration.test.ts` runs 3,000 matches with tolerances, so a model change that breaks realism fails the test suite.
- **Win probability:** `npm run winprob` rebuilds `src/sim/match/winprob.json`. The table holds the mean and spread of the runs still to come from each (balls left, wickets) state, measured over 20,000 simulated innings. `winProb.ts` reads it. Rebuild it after any model change.

## Latest run (10,000 matches)

```
metric                     real      sim     diff
run rate                    9.7     9.77    0.070
RR powerplay               9.76      9.8    0.040
RR middle                  9.05     9.15    0.100
RR death                     11    11.24    0.240
wkt/ball powerplay       0.0431   0.0439    0.001
wkt/ball middle          0.0465   0.0483    0.002
wkt/ball death           0.0819   0.0852    0.003
dot %                     0.274    0.264   -0.010
single %                  0.381    0.383    0.002
two %                     0.059    0.059    0.000
four %                    0.136    0.136    0.000
six %                      0.08    0.082    0.002
wides / inns               5.99     5.97   -0.020
no-balls / inns            0.47     0.49    0.020
leg-byes / inns             1.9     1.83   -0.070
1st inns mean             191.9    188.9   -3.000
1st inns sd                37.4     37.6    0.200
1st inns p10                147      138   -9.000
1st inns p50                195      194   -1.000
1st inns p90                238      232   -6.000
wickets / inns             6.08     5.95   -0.130
chase win %               0.555    0.527   -0.028
```

The tie rate runs a little high. The real figure is 2 ties in 213 matches, which is too small a sample to tune against.

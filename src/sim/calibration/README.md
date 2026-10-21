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

  The real targets already include the Impact Player era (2024+). Because DRS adds lbws and drops remove catches, the model's dismissal mix sets caught higher and lbw lower than the real one; the simulated mix comes out close to real.

- **Known gaps:**
  - The first-innings 90th percentile is about 8 runs low.
  - Hat-tricks (about 9% of matches) and five-wicket hauls (about 0.11 per match) are more common than in real IPL. This was already true before engine v2: wickets cluster when tail-enders arrive together.

- **Harness:** `harness.ts` plays N matches between random pairs of the 10 squads.
  - `npm run calibrate` runs 10,000 matches and prints the table below (about 2.5 s), plus drops and misfields per match.
  - `calibration.test.ts` runs 3,000 matches with tolerances, so a model change that breaks realism fails the test suite.
- **Win probability:** `npm run winprob` rebuilds `src/sim/match/winprob.json`. The table holds the mean and spread of the runs still to come from each (balls left, wickets) state, measured over 20,000 simulated innings. `winProb.ts` reads it. Rebuild it after any model change.

## Latest run (10,000 matches)

```
metric                     real      sim     diff
run rate                    9.7     9.74    0.040
RR powerplay               9.76     9.79    0.030
RR middle                  9.05     9.14    0.090
RR death                     11    11.08    0.080
wkt/ball powerplay       0.0431   0.0453    0.002
wkt/ball middle          0.0465   0.0483    0.002
wkt/ball death           0.0819   0.0866    0.005
dot %                     0.274    0.266   -0.008
single %                  0.381     0.38   -0.001
two %                     0.059    0.059    0.000
four %                    0.136    0.138    0.002
six %                      0.08     0.08    0.000
wides / inns               5.99     5.98   -0.010
no-balls / inns            0.47     0.48    0.010
leg-byes / inns             1.9     1.85   -0.050
1st inns mean             191.9    188.7   -3.200
1st inns sd                37.4     35.1   -2.300
1st inns p10                147      142   -5.000
1st inns p50                195      192   -3.000
1st inns p90                238      230   -8.000
wickets / inns             6.08     6.07   -0.010
chase win %               0.555    0.534   -0.021
tie %                    0.0094   0.0129    0.003  <--
```

The tie rate runs a little high. The real figure is 2 ties in 213 matches, which is too small a sample to tune against.

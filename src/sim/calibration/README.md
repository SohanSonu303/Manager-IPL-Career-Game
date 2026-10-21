# Sim calibration

The ball-by-ball sim is tuned so that AI-vs-AI matches between the real squads look like real IPL cricket.

- **Targets:** `targets.json` holds aggregates from IPL ball-by-ball data for the 2024, 2025 and 2026 seasons (213 full 20-over matches). The data comes from [Cricsheet](https://cricsheet.org), used under the Open Data Commons Attribution License. Only aggregates are stored here, not the raw data. To regenerate it, run `npx tsx scripts/cricsheet-targets.ts <unzipped ipl_json dir> 2024`.
- **Model constants:** `MODEL` in `src/sim/match/model.ts` holds the per-phase base rates, the skill and intent sensitivity, extras and the dismissal mix.
- **Harness:** `harness.ts` plays N matches between random pairs of the 10 squads.
  - `npm run calibrate` runs 10,000 matches and prints the table below (about 1.5 s).
  - `calibration.test.ts` runs 3,000 matches with tolerances, so a model change that breaks realism fails the test suite.

## Latest run (10,000 matches)

```
metric                     real      sim     diff
run rate                    9.7     9.78    0.080
RR powerplay               9.76     9.84    0.080
RR middle                  9.05      9.2    0.150
RR death                     11    11.05    0.050
wkt/ball powerplay       0.0431   0.0431    0.000
wkt/ball middle          0.0465   0.0479    0.001
wkt/ball death           0.0819   0.0835    0.002
dot %                     0.274    0.268   -0.006
single %                  0.381     0.38   -0.001
two %                     0.059    0.059    0.000
four %                    0.136    0.135   -0.001
six %                      0.08    0.084    0.004
wides / inns               5.99     6.11    0.120
no-balls / inns            0.47     0.48    0.010
leg-byes / inns             1.9     1.87   -0.030
1st inns mean             191.9    190.1   -1.800
1st inns sd                37.4     36.5   -0.900
1st inns p10                147      142   -5.000
1st inns p50                195      193   -2.000
1st inns p90                238      234   -4.000
wickets / inns             6.08     5.98   -0.100
chase win %               0.555    0.569    0.014
```

The tie rate runs a little high. The real figure is 2 ties in 213 matches, which is too small a sample to tune against.

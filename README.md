# Cricket Manager (working title)

Mobile-first cricket career management sim. See `TODO.md` for the plan.

## Commands

- `npm run dev` start the dev server
- `npm run build` typecheck and build (with PWA)
- `npm run preview` serve the production build
- `npm test` run Vitest (sim tests)
- `npm run lint`, `npm run typecheck`, `npm run format`

## Layout

`src/sim` is pure TypeScript (no React/DOM; enforced by ESLint). UI in `src/ui`, state in `src/state`, JSON data in `src/data`, 3D in `src/match3d`, design tokens in `src/theme`.

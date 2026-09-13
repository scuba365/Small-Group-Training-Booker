# Training Studio

Small-group personal training software for booking coached sessions, following programmed workouts, and tracking member progress.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/training-studio` — responsive React + Vite member and coach experience.
- `artifacts/api-server/src/routes/training.ts` — training dashboard, schedule booking, workout, and roster routes.
- `artifacts/api-server/src/lib/training-data.ts` — first-build seeded training dataset and in-process mutations.
- `lib/api-spec/openapi.yaml` — source of truth for the generated client and server response contracts.
- `artifacts/training-studio/src/index.css` — Training Studio visual tokens and responsive shell styles.

## Architecture decisions

- The first build uses one shared API contract for member and coach surfaces so the app can expand without parallel client-only models.
- Booking and workout completion are real mutations with cache invalidation; the UI does not fake success with local-only state.
- The seeded training data lives behind API route modules so moving to Postgres does not require changing the generated frontend hooks.
- The responsive navigation keeps the member flow usable on mobile while preserving the denser coach roster view on larger screens.

## Product

- Member dashboard with streak, readiness, booked sessions, upcoming training, progress markers, and recent workout activity.
- Weekly/monthly schedule browsing with real capacity, booking, and cancellation states.
- Programmed workout library with exercise prescriptions and a completion log.
- Coach roster with attendance, goals, streaks, and recent activity.

## User preferences

- This is intended as a co-build with Claude Code, so keep the API contract explicit and the feature boundaries easy to extend.

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run `pnpm --filter @workspace/api-spec run codegen`.
- The generated API client requires `dom.iterable` in `lib/api-client-react/tsconfig.json` because the fetch helper reads `Headers.entries()`.
- The current training dataset is in-process seed data; it resets when the API server restarts.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

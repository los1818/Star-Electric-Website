# Star FieldOps — working notes for Claude

Star FieldOps is the in-house field service management system for **Star Electric Corp.**,
a commercial electrical contractor in Regina, Saskatchewan. It replaces ServiceBox and the
older Trimble Time & Material Billing. The full spec lives in `docs/SPEC.md`; read it before
changing anything.

> This app lives in the `fieldops/` folder of the `star-electric-website` repo. The repo root
> is the public marketing site (static HTML). Never touch files outside `fieldops/` from
> FieldOps work, and never mix the two.

## Stack
- Next.js (App Router) + TypeScript (strict)
- PostgreSQL 16 via Docker Compose
- Prisma ORM (schema in `prisma/schema.prisma`, migrations committed)
- Auth.js (NextAuth v5): Microsoft Entra ID in production; dev-only email login
  (enabled only when `NODE_ENV !== "production"` and `AUTH_DEV_LOGIN=true`)
- Tailwind CSS for styling
- Vitest for unit tests, Playwright for end-to-end tests

## Rules
- **Money is integer cents** (`Int` in Prisma, `number` of cents in TS). Never use floats for
  money. All rounding goes through `src/lib/money.ts`.
- **Tax rates are basis points** (5% = 500) and live in the `TaxLevel` table, not in code.
- **No hard-coded enums in the UI** for anything a user might want to change (statuses,
  categories, types, priorities, tax levels, timesheet item types). Those are seeded lookup
  tables, editable in Settings. Code may refer to a lookup row's stable `code`, never its label.
- **Every server action checks permissions** through `src/lib/auth/permissions.ts`
  (`requirePermission`). The UI hiding a button is not a security check.
- Server actions validate input with Zod.
- Small commits with clear messages. No features beyond the current phase.
- When SPEC is ambiguous, ask instead of guessing. If a decision changes, update `docs/SPEC.md`
  in the same commit.
- Seed data is fake. Use Regina addresses; no real customer names.

## Commands (run from `fieldops/`)
- `docker compose up -d`: start Postgres
- `npm run db:migrate`: apply migrations; `npm run db:seed`: seed
- `npm run dev`: dev server on http://localhost:3000
- `npm test`: Vitest; `npm run test:e2e`: Playwright
- `npm run lint` / `npm run typecheck`

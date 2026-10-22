# Sparks

In-house field service management for Star Electric Corp., Regina, SK. Replaces ServiceBox and
Trimble Time & Material Billing. Spec: [`docs/SPEC.md`](docs/SPEC.md). Working rules:
[`CLAUDE.md`](CLAUDE.md).

**Phase 0 (Foundation)**: app shell, full database schema, sign-in and roles, seed data, tests.
The modules themselves are placeholders until later phases.

## Run it locally

You need Node.js 22+ and Docker Desktop.

```bash
cd sparks
cp .env.example .env          # then set AUTH_SECRET (run: npx auth secret)
npm install
docker compose up -d          # Postgres on localhost:5432
npm run db:migrate            # create tables
npm run db:seed               # lookup tables + fake demo data (wipes the database)
npm run dev                   # http://localhost:3000
```

Sign in on the login page with the **Development login** buttons:

| User | Role |
|---|---|
| admin@star-electric.example | Administrator |
| office@star-electric.example | Office |
| tech@star-electric.example | Technician (Marcus Lindqvist) |
| tech2@star-electric.example | Technician (Jasmine Okafor) |
| new.hire@star-electric.example | Awaiting access (shows the pending screen) |

The dev login only exists when `NODE_ENV` isn't `production` **and** `AUTH_DEV_LOGIN=true`.

### Microsoft sign-in (Entra ID)

1. In Azure portal → Entra ID → App registrations → New registration (single tenant).
2. Redirect URI (Web): `http://localhost:3000/api/auth/callback/microsoft-entra-id`
   (plus your production URL later).
3. Certificates & secrets → New client secret.
4. Set `AUTH_MICROSOFT_ENTRA_ID_ID` (Application ID), `AUTH_MICROSOFT_ENTRA_ID_SECRET`, and
   `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0` in `.env`.
5. Create the first administrator: `npm run user:create -- --email you@starelectric.ca --name "Your Name" --role ADMIN`

Anyone with an `@starelectric.ca` account (`AUTH_ALLOWED_EMAIL_DOMAINS`) can then sign in. New people land on an
"awaiting access" screen until an administrator assigns their role in **Settings → Users** (and links technicians
to their employee record).

## Tests

```bash
npm test               # Vitest: money/tax maths, permission map, server action enforcement
npm run test:e2e       # Playwright smoke tests (needs a seeded DB; starts the dev server)
npm run typecheck
npm run lint
```

## Layout

```
prisma/schema.prisma      full data model (SPEC §4)
prisma/seed/              lookups.ts (safe for prod: --lookups-only) and demo.ts (fake data)
src/auth.ts               Auth.js: Entra ID + dev login
src/lib/money.ts          cents, rounding, GST/PST totals
src/lib/auth/             role → permission map, server-side guards
src/lib/nav.ts            sidebar modules and New menu
src/server/actions/       server actions (all wrapped in authorizedAction)
src/app/(app)/            signed-in pages, one folder per module
scripts/migrate-trimble/  Trimble T&M Billing ETL stub
tests/unit, tests/e2e
```

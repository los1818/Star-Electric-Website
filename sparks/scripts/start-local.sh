#!/usr/bin/env bash
# Start Sparks on this computer (macOS / Linux). Safe to run again: the first run sets things up,
# later runs just start the app. Demo data loads only into an empty database, so updating never
# wipes your data. Pass --reset-demo to deliberately wipe everything and reload the demo data.
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n\033[1;33m==>\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31mProblem:\033[0m %s\n\n' "$*"; exit 1; }

command -v node >/dev/null 2>&1 || fail "Node.js isn't installed. Install the LTS version from https://nodejs.org and run this again."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || fail "Node.js $(node -v) is too old. Install the LTS version (22) from https://nodejs.org."
command -v docker >/dev/null 2>&1 || fail "Docker Desktop isn't installed. Install it from https://www.docker.com/products/docker-desktop/ and run this again."
docker info >/dev/null 2>&1 || fail "Docker Desktop isn't running. Open Docker Desktop, wait until it says it's running, then run this again."

if [ ! -f .env ]; then
  say "Creating settings file (.env)"
  cp .env.example .env
  secret=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
  node -e "const fs=require('fs');fs.writeFileSync('.env',fs.readFileSync('.env','utf8').replace(/^AUTH_SECRET=.*$/m,'AUTH_SECRET=\"'+process.argv[1]+'\"'))" "$secret"
fi

say "Installing app components (first time takes a few minutes)"
npm install --no-audit --no-fund --loglevel=error

say "Starting the database"
docker compose up -d
for _ in $(seq 1 60); do
  docker compose exec -T db pg_isready -U sparks >/dev/null 2>&1 && break
  sleep 1
done
docker compose exec -T db pg_isready -U sparks >/dev/null 2>&1 || fail "The database didn't start. Check Docker Desktop for errors."

say "Updating the database"
npx prisma migrate deploy

if [ "${1:-}" = "--reset-demo" ] || npx tsx scripts/needs-seed.ts; then
  say "Loading demo data (fake customers, jobs and staff)"
  npx prisma db seed
fi

open_browser() {
  for _ in $(seq 1 120); do
    if curl -s -o /dev/null http://localhost:3000/login; then
      if command -v open >/dev/null 2>&1; then open http://localhost:3000; elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:3000; fi
      return
    fi
    sleep 2
  done
}
open_browser &

say "Sparks is starting at http://localhost:3000  (leave this window open; press Ctrl+C to stop)"
npm run dev

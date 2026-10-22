#!/bin/sh
# Container entrypoint. Env: DATABASE_URL (required), ANTHROPIC_API_KEY, COOKIE_SECRET,
# DATABASE_CA_PEM (Aiven CA certificate content, written to a file), RUN_MIGRATIONS=1, RUN_SEED=1.
set -e
cd /app
if [ -n "$DATABASE_CA_PEM" ]; then
  mkdir -p var && printf '%s\n' "$DATABASE_CA_PEM" > var/aiven-ca.pem
  export DATABASE_CA_CERT=/app/var/aiven-ca.pem
fi
WEB_PORT="${PORT:-8080}"
export PORT="${API_PORT:-4000}"
[ "$RUN_MIGRATIONS" = "1" ] && pnpm db:migrate
[ "$RUN_SEED" = "1" ] && pnpm db:seed
API_URL=http://127.0.0.1:$PORT WEB_PORT="$WEB_PORT" node apps/web/serve.mjs &
cd apps/server && exec node_modules/.bin/tsx src/main.ts

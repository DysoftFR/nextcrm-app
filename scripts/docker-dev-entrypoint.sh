#!/bin/sh
set -eu

pnpm config set store-dir /pnpm/store

pnpm install --frozen-lockfile --prefer-offline
pnpm prisma generate
pnpm prisma migrate deploy
pnpm prisma db seed

exec pnpm exec next dev --turbopack --disable-source-maps -H 0.0.0.0 -p 3020

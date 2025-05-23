#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
npx wait-on -t 60000 tcp:postgres:5432

echo "Running database migrations..."
npx prisma migrate dev --name init

npx prisma migrate deploy

echo "Starting Central Tracking Service..."
exec "$@"
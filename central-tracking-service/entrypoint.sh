#!/bin/sh
# Aguarda o Postgres ficar pronto (usa netcat)
echo "⏳ Esperando o banco de dados em postgres:5432..."
while ! nc -z postgres 5432; do
  sleep 1
done
echo "✅ Banco de dados pronto!"

# Roda as migrations
npx prisma migrate deploy

# Inicia o app
npm run start:dev

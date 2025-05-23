FROM node:20-slim

WORKDIR /app

COPY eta-service/package*.json ./
RUN npm install

COPY eta-service/tsconfig.json ./
COPY eta-service/src/ ./src/

RUN npm run build || echo "No build script found"

EXPOSE 50052

CMD ["node", "dist/server.js"]
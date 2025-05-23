FROM node:20-slim

WORKDIR /app

# Install dependencies for Prisma and PostgreSQL client
RUN apt-get update -y && apt-get install -y openssl postgresql-client

# Copy package files and install dependencies
COPY central-tracking-service/package*.json ./
RUN npm install

# Copy prisma schema
COPY central-tracking-service/prisma/ ./prisma/

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY central-tracking-service/tsconfig.json ./
COPY central-tracking-service/src/ ./src/
COPY central-tracking-service/entrypoint.sh ./

# Build TypeScript
RUN npm run build || echo "No build script found"

# Make entrypoint executable
RUN chmod +x entrypoint.sh

# Expose the gRPC port
EXPOSE 50051

# Set entrypoint
ENTRYPOINT ["./entrypoint.sh"]

# Default command
CMD ["node", "dist/server.js"]
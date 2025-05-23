FROM node:20-slim

WORKDIR /app

COPY express-grpc-gateway/package*.json ./
RUN npm install

COPY express-grpc-gateway/server.js ./

EXPOSE 3001

CMD ["node", "server.js"]
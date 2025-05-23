FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY tsconfig*.json ./
COPY vite.config.ts ./
COPY index.html ./
COPY eslint.config.js ./
COPY public/ ./public/
COPY src/ ./src/

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--strictPort"]
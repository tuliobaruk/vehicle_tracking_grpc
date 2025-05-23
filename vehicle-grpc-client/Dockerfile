FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache bash curl wget

COPY vehicle-grpc-client/package*.json ./
RUN npm install

COPY vehicle-grpc-client/tsconfig.json ./
COPY vehicle-grpc-client/src/ ./src/

RUN npm run build || echo "No build script found"

ENV GPX_FILE="GPX/CampusJBG-Recife.gpx"
ENV VEHICLE_ID="vehicle-1"
ENV TRACKING_SERVER="central-tracking-service:50051"
ENV INTERVAL=5
ENV VEHICLE_SPEED=50

CMD ["tail", "-f", "/dev/null"]
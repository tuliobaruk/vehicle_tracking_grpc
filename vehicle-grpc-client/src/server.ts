import path from 'path';
import * as grpc from '@grpc/grpc-js';
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = path.resolve(__dirname, '../protos/tracking.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const trackingProto = grpc.loadPackageDefinition(packageDefinition) as any;

function streamLocation(call: grpc.ServerDuplexStream<any, any>) {
  call.on('data', (update) => {
    console.log('Recebido do cliente:', update);
    call.write({ vehicleId: update.vehicleId, lat: update.lat, lon: update.lon, timestamp: Date.now() });
  });
  call.on('end', () => call.end());
}

function main() {
  const server = new grpc.Server();
  server.addService(trackingProto.tracking.Tracker.service, { StreamLocation: streamLocation });
  const port = '0.0.0.0:50051';
  server.bindAsync(port, grpc.ServerCredentials.createInsecure(), () => {
    console.log(`Servidor RPC mockado rodando na porta: ${port}`);
  });
}

main();
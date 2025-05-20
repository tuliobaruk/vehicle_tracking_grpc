import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { parseGpx, Point } from './gpx-parser';

// Não tava funcionando com IMPORT
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const argv = yargs(hideBin(process.argv))
  .option('file', { type: 'string', demandOption: true, alias: 'f', description: 'Path to GPX file' })
  .option('id', { type: 'string', demandOption: true, alias: 'i', description: 'Vehicle ID' })
  .option('interval', { type: 'number', default: 5, alias: 't', description: 'Seconds per point' })
  .parseSync();

const filePath: string = argv.file;
const vehicleId: string = argv.id;
const intervalSec: number = argv.interval;

const PROTO_PATH = path.resolve(__dirname, '../protos/tracking.proto');
const packageDef2 = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const trackingProto2 = grpc.loadPackageDefinition(packageDef2) as any;

const client = new trackingProto2.tracking.Tracker('localhost:50051', grpc.credentials.createInsecure());

async function simulate(file: string, id: string, interval: number) {
  const points: Point[] = parseGpx(file);
  const call = client.StreamLocation();

  call.on('data', (response: any) => console.log('Server response:', response));

  for (const pt of points) {
    const now = Date.now();
    call.write({ vehicleId: id, lat: pt.lat, lon: pt.lon, timestamp: now });
    await new Promise(res => setTimeout(res, interval * 1000));
  }


  call.end();
}

simulate(filePath, vehicleId, intervalSec).catch(err => { console.error('Simulation error:', err); process.exit(1); });

import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { parseGpx, Point } from './gpx-parser';
import * as readline from 'readline';

// Não tava funcionando com IMPORT
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const argv = yargs(hideBin(process.argv))
  .option('file', { type: 'string', demandOption: true, alias: 'f', description: 'Path to GPX file' })
  .option('id', { type: 'string', demandOption: true, alias: 'i', description: 'Vehicle ID' })
  .option('interval', { type: 'number', default: 5, alias: 't', description: 'Seconds per point' })
  .option('vel', { type: 'number', alias: 'v', description: 'Vehicle speed in KM'})
  .option('server', { type: 'string', default: 'localhost:50051', alias: 's', description: 'Tracking server address'})
  .option('interactive', { type: 'boolean', default: false, alias: 'int', description: 'Enable interactive mode'})
  .parseSync();

const filePath: string = argv.file;
const vehicleId: string = argv.id;
const intervalSec: number = argv.interval;
const vehicleVel: number = argv.vel ?? 50;
const serverAddress: string = argv.server;
const interactiveMode: boolean = argv.interactive;

const PROTO_PATH = path.resolve(__dirname, '../protos/tracking.proto');
const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const trackingProto = grpc.loadPackageDefinition(packageDef) as any;

const client = new trackingProto.tracking.Tracker(serverAddress, grpc.credentials.createInsecure());

// Estado do veículo
let currentSpeed = vehicleVel;
let isRunning = true;
let isPaused = false;
let baseInterval = intervalSec; // Intervalo base original
let currentInterval = intervalSec; // Intervalo atual dinâmico
let isConnected = false;
let hasConflict = false;

// Função para calcular intervalo baseado na velocidade
function calculateInterval(speed: number): number {
  // Velocidade de referência (50 km/h) = intervalo base
  const referenceSpeed = 50;
  // Fórmula: intervalo = intervalo_base * (velocidade_referencia / velocidade_atual)
  // Velocidade maior = intervalo menor (atualiza mais rápido)
  // Velocidade menor = intervalo maior (atualiza mais devagar)
  const newInterval = Math.max(1, Math.round(baseInterval * (referenceSpeed / speed)));
  return newInterval;
}

function exitWithError(message: string, code: number = 1) {
  console.error(`\n❌ ${message}`);
  console.error('🔌 Encerrando cliente...');
  isRunning = false;
  if (rl) rl.close();
  process.exit(code);
}

// Interface de linha de comando
let rl: readline.Interface | null = null;

function setupInteractiveMode() {
  if (!interactiveMode) return;

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('\n🎮 MODO INTERATIVO ATIVADO!');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║           COMANDOS DISPONÍVEIS         ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log('║ + ou =     → Acelerar (+10 km/h, ↓ intervalo)    ║');
  console.log('║ - ou _     → Reduzir (-10 km/h, ↑ intervalo)     ║');
  console.log('║ s [vel]    → Definir velocidade (ajusta intervalo)║');
  console.log('║ p          → Pausar/Retomar            ║');
  console.log('║ status     → Mostrar status            ║');
  console.log('║ help       → Mostrar ajuda             ║');
  console.log('║ q ou quit  → Sair                      ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');

  rl.on('line', (input) => {
    const command = input.trim().toLowerCase();
    handleInteractiveCommand(command);
  });
}

function handleInteractiveCommand(command: string) {
  if (hasConflict) {
    console.log('❌ Comandos desabilitados devido a conflito de ID');
    return;
  }

  const oldSpeed = currentSpeed;

  switch (command) {
    case '+':
    case '=':
      currentSpeed = Math.min(200, currentSpeed + 10);
      currentInterval = calculateInterval(currentSpeed);
      console.log(`🚀 Acelerando: ${oldSpeed} → ${currentSpeed} km/h`);
      console.log(`⏱️  Intervalo ajustado: ${currentInterval}s (era ${baseInterval}s)`);
      break;

    case '-':
    case '_':
      currentSpeed = Math.max(10, currentSpeed - 10);
      currentInterval = calculateInterval(currentSpeed);
      console.log(`🐌 Reduzindo: ${oldSpeed} → ${currentSpeed} km/h`);
      console.log(`⏱️  Intervalo ajustado: ${currentInterval}s (era ${baseInterval}s)`);
      break;

    case 'p':
    case 'pause':
      isPaused = !isPaused;
      console.log(isPaused ? '⏸️  Veículo PAUSADO' : '▶️  Veículo RETOMADO');
      break;

    case 'status':
      showStatus();
      break;

    case 'help':
      showHelp();
      break;

    case 'q':
    case 'quit':
      console.log('👋 Encerrando simulação...');
      isRunning = false;
      if (rl) rl.close();
      process.exit(0);
      break;

    default:
      // Comando para definir velocidade específica: s 60
      if (command.startsWith('s ')) {
        const vel = parseInt(command.split(' ')[1]);
        if (!isNaN(vel) && vel >= 10 && vel <= 200) {
          currentSpeed = vel;
          currentInterval = calculateInterval(currentSpeed);
          console.log(`🎯 Velocidade: ${oldSpeed} → ${currentSpeed} km/h`);
          console.log(`⏱️  Intervalo ajustado: ${currentInterval}s (era ${baseInterval}s)`);
        } else {
          console.log('❌ Velocidade inválida. Use: s [10-200]');
        }
      } else if (command !== '') {
        console.log('❓ Comando não reconhecido. Digite "help" para ver os comandos.');
      }
      break;
  }
}

function showStatus() {
  const speedRatio = (currentSpeed / 50).toFixed(2);
  const frequencyChange = currentInterval < baseInterval ? '↑ Mais frequente' :
                         currentInterval > baseInterval ? '↓ Menos frequente' : '→ Normal';

  console.log('\n📊 STATUS DO VEÍCULO:');
  console.log(`🚗 ID: ${vehicleId}`);
  console.log(`🔗 Conexão: ${isConnected ? '✅ CONECTADO' : hasConflict ? '❌ CONFLITO' : '⏳ CONECTANDO'}`);
  console.log(`🏃 Velocidade: ${currentSpeed} km/h (${speedRatio}x da referência)`);
  console.log(`⏱️  Intervalo: ${currentInterval}s (base: ${baseInterval}s) ${frequencyChange}`);
  console.log(`⏸️  Estado: ${isPaused ? 'PAUSADO' : 'RODANDO'}`);
  console.log(`🌐 Servidor: ${serverAddress}`);

  if (hasConflict) {
    console.log('');
    console.log('⚠️  CONFLITO DETECTADO:');
    console.log(`   • ID "${vehicleId}" já está em uso`);
    console.log('   • Escolha outro ID ou pare o outro cliente');
  }
  console.log('');
}

function showHelp() {
  console.log('\n🎮 COMANDOS INTERATIVOS:');
  console.log('+ ou =     → Acelerar (+10 km/h, intervalo ↓)');
  console.log('- ou _     → Reduzir (-10 km/h, intervalo ↑)');
  console.log('s [vel]    → Definir velocidade (ex: s 80, ajusta intervalo)');
  console.log('p          → Pausar/Retomar simulação');
  console.log('status     → Mostrar status atual (velocidade + intervalo)');
  console.log('q ou quit  → Sair da simulação');
  console.log('');
  console.log('⏱️  LÓGICA DE INTERVALOS:');
  console.log('• Velocidade 25 km/h → Intervalo 10s (2x mais devagar)');
  console.log('• Velocidade 50 km/h → Intervalo 5s (referência)');
  console.log('• Velocidade 100 km/h → Intervalo 2.5s (2x mais rápido)');
  console.log('• Maior velocidade = menor interval = atualizações mais frequentes');
  console.log('');
}

async function simulate(file: string, id: string, interval: number, initialVel: number) {
  console.log(`🚗 Iniciando simulação do veículo: ${id}`);
  console.log(`📍 Arquivo GPX: ${file}`);
  console.log(`⏱️  Intervalo base: ${interval}s por ponto`);
  console.log(`🏃 Velocidade inicial: ${initialVel} km/h`);
  console.log(`🌐 Conectando ao servidor: ${serverAddress}`);

  // Calcula intervalo inicial baseado na velocidade
  currentInterval = calculateInterval(currentSpeed);
  if (currentInterval !== baseInterval) {
    console.log(`⏱️  Intervalo ajustado: ${currentInterval}s (velocidade ${currentSpeed} km/h)`);
  }

  console.log('='.repeat(50));

  const points: Point[] = parseGpx(file);
  console.log(`📊 ${points.length} pontos carregados do GPX`);

  const destination = points[points.length - 1]; // Pegando o destino no último ponto
  console.log(`🎯 Destino: ${destination.lat}, ${destination.lon}`);

  setupInteractiveMode();

  const call = client.StreamLocation();

  call.on('data', (response: any) => {
    if (response.command === 'CONFLITO_ID' || response.status === 'ERROR_DUPLICATE_ID') {
      hasConflict = true;
      isConnected = false;

      console.log('\n🚨 ═══════════════════════════════════════════════════════════');
      console.log('🚨 ❌ CONFLITO DE ID DETECTADO!');
      console.log(`🚨 • O ID "${vehicleId}" já está sendo usado por outro cliente`);
      console.log('🚨 • Este cliente será encerrado para evitar conflitos');
      console.log('🚨 ═══════════════════════════════════════════════════════════');
      console.log('');
      console.log('💡 SOLUÇÕES:');
      console.log('   1. Use um ID diferente: --id carro-02, --id van-01, etc.');
      console.log('   2. Pare o outro cliente que está usando este ID');
      console.log('   3. Verifique se não há processo duplicado rodando');
      console.log('');

      setTimeout(() => {
        exitWithError(`ID "${vehicleId}" em uso. Use outro ID.`, 2);
      }, 3000);

      return;
    }

    if (response.status === 'TRACKING_ACTIVE' && !isConnected) {
      isConnected = true;
      console.log('✅ Conexão estabelecida com sucesso!');
      console.log(`🔗 Servidor confirmou tracking ativo para ${vehicleId}`);
      console.log('');
    }

    if (!interactiveMode && !hasConflict) {
      console.log(`📡 Resposta da Central:`);
      console.log(`  ✅ Status: ${response.status || 'N/A'}`);
    }

    if (response.command && !hasConflict) {
      const oldSpeed = currentSpeed;

      // Processa comandos da central apenas se comandos automáticos estiverem ativados
      switch (response.command) {
        case 'REDUZIR_VELOCIDADE':
          currentSpeed = Math.max(20, currentSpeed - 10);
          currentInterval = calculateInterval(currentSpeed);
          console.log(`🤖 CENTRAL: Reduzindo velocidade ${oldSpeed} → ${currentSpeed} km/h`);
          console.log(`⏱️  Intervalo ajustado: ${currentInterval}s`);
          break;
        case 'ACELERAR':
          currentSpeed = Math.min(100, currentSpeed + 10);
          currentInterval = calculateInterval(currentSpeed);
          console.log(`🤖 CENTRAL: Acelerando ${oldSpeed} → ${currentSpeed} km/h`);
          console.log(`⏱️  Intervalo ajustado: ${currentInterval}s`);
          break;
        case 'PARAR':
          console.log(`🛑 CENTRAL: Comando de parada recebido`);
          isPaused = true;
          break;
        default:
          if (!interactiveMode) {
            console.log(`❓ Comando desconhecido: ${response.command}`);
          }
      }
    }

    if (!interactiveMode && !hasConflict) {
      const responseTime = parseInt(response.timestamp) || Date.now();
      console.log(`  ⏰ Timestamp da resposta: ${new Date(responseTime).toLocaleString('pt-BR')}`);
      console.log('-'.repeat(30));
    }
  });

  call.on('error', (error: any) => {
    console.error('❌ Erro na conexão com a central:', error.message);

    if (error.message.includes('UNAVAILABLE') || error.message.includes('Connection refused')) {
      console.error('💡 Verifique se o central-tracking-service está rodando');
      console.error('💡 Comando: cd central-tracking-service && npm run dev');
    }

    exitWithError('Falha na conexão gRPC', 1);
  });

  call.on('end', () => {
    console.log('🔌 Conexão com a central encerrada');
    if (!hasConflict) {
      console.log('ℹ️  Encerramento normal da conexão');
    }
  });

  console.log('⏳ Aguardando confirmação do servidor...');

  const testUpdate = {
    vehicleId: id,
    lat: points[0]?.lat || 0,
    lon: points[0]?.lon || 0,
    timestamp: Date.now(),
    vel: currentSpeed
  };

  call.write(testUpdate);

  await new Promise(res => setTimeout(res, 1000));

  if (hasConflict) {
    return;
  }

  if (!isConnected) {
    console.log('⚠️  Servidor não respondeu, mas continuando...');
  }

  // Envia pontos do GPX
  for (let i = 0; i < points.length && isRunning && !hasConflict; i++) {
    // Pausa se solicitado
    while (isPaused && isRunning && !hasConflict) {
      await new Promise(res => setTimeout(res, 1000));
    }

    if (!isRunning || hasConflict) break;

    const pt = points[i];
    const now = Date.now();

    const update = {
      vehicleId: id,
      lat: pt.lat,
      lon: pt.lon,
      timestamp: now,
      vel: currentSpeed,
      destLat: destination.lat,
      destLon: destination.lon
    };

    if (interactiveMode) {
      // Modo interativo: log compacto com intervalo atual
      const intervalInfo = currentInterval !== baseInterval ? ` (${currentInterval}s)` : '';
      const connectionStatus = hasConflict ? '❌ CONFLITO' : isConnected ? '🟢' : '🟡';
      process.stdout.write(`\r${connectionStatus} ${id} | Pos: ${i + 1}/${points.length} | ${pt.lat.toFixed(6)}, ${pt.lon.toFixed(6)} | ${currentSpeed} km/h${intervalInfo} | ${isPaused ? '⏸️' : '▶️'} | Destino: ${destination.lat}, ${destination.lon}`);
    } else {
      // Modo normal: log completo
      console.log(`📍 Enviando posição ${i + 1}/${points.length}:`);
      console.log(`  📍 Lat/Lon: ${pt.lat.toFixed(6)}, ${pt.lon.toFixed(6)}`);
      console.log(`  🏃 Velocidade: ${currentSpeed} km/h`);
      console.log(`  ⏱️  Intervalo: ${currentInterval}s`);
      console.log(`  ⏰ ${new Date(now).toLocaleString('pt-BR')}`);
    }

    try {
      call.write(update);
    } catch (error) {
      if (!hasConflict) {
        console.error('❌ Erro ao enviar posição:', error);
      }
      break;
    }

    // Usa o intervalo dinâmico atual
    await new Promise(res => setTimeout(res, currentInterval * 1000));
  }

  if (hasConflict) {
    console.log('\n❌ Simulação interrompida devido a conflito de ID');
  } else {
    console.log('\n✅ Simulação concluída');
  }

  call.end();
  if (rl) rl.close();
}

// Tratamento de sinais para encerramento gracioso
process.on('SIGINT', () => {
  console.log('\n🛑 Recebido sinal de interrupção');
  console.log('⏹️  Encerrando simulação...');
  isRunning = false;
  if (rl) rl.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Recebido sinal de término');
  console.log('⏹️  Encerrando simulação...');
  isRunning = false;
  if (rl) rl.close();
  process.exit(0);
});

simulate(filePath, vehicleId, intervalSec, vehicleVel).catch(err => {
  console.error('❌ Erro na simulação:', err);
  if (rl) rl.close();
  process.exit(1);
});
import path from 'path';
import * as readline from 'readline';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Cliente ETA
const PROTO_PATH = path.resolve(__dirname, '../protos/eta.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const etaProto = grpc.loadPackageDefinition(packageDefinition) as any;
const etaClient = new etaProto.eta.ETAService('localhost:50052', grpc.credentials.createInsecure());

// Cliente Tracking (para listar veículos)
const TRACKING_PROTO_PATH = path.resolve(__dirname, '../protos/tracking.proto');
const trackingPackageDef = protoLoader.loadSync(TRACKING_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const trackingProto = grpc.loadPackageDefinition(trackingPackageDef) as any;
const trackingClient = new trackingProto.tracking.Tracker('localhost:50051', grpc.credentials.createInsecure());

// Interface readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Coordenadas pré-definidas
interface Location {
  lat: number;
  lon: number;
  name: string;
}

const LOCATIONS: Record<string, Location> = {
  'recife': { lat: -8.0476, lon: -34.8770, name: 'Centro do Recife' },
  'boaviagem': { lat: -8.1137, lon: -34.8851, name: 'Boa Viagem' },
  'olinda': { lat: -8.0089, lon: -34.8553, name: 'Olinda' },
  'jaboatao': { lat: -8.1137, lon: -35.0220, name: 'Jaboatão Centro' },
  'piedade': { lat: -8.1644, lon: -35.0067, name: 'Piedade' },
  'candeias': { lat: -8.1281, lon: -34.9269, name: 'Candeias' },
  'campus-recife': { lat: -8.047562, lon: -34.876292, name: 'Campus Recife' },
  'campus-jaboatao': { lat: -8.1916, lon: -35.0066, name: 'Campus Jaboatão' }
};

let currentDestination: Location = LOCATIONS['recife'];
let connectedVehicles: string[] = [];

function formatETA(eta: any): void {
  console.log(`\n┌─── 🚗 ${eta.vehicleId} ───────────────────────────────────────┐`);
  console.log(`│ 📍 Posição atual: ${eta.currentLat?.toFixed(6)}, ${eta.currentLon?.toFixed(6)}`);
  console.log(`│ 📏 Distância: ${eta.distanceKm} km`);
  console.log(`│ 🏃 Velocidade: ${eta.currentSpeed} km/h`);
  console.log(`│ ⏱️  Tempo estimado: ${eta.estimatedMinutes} minutos`);
  console.log(`│ 🕐 Chegada: ${new Date(eta.arrivalTime).toLocaleString('pt-BR')}`);
  console.log(`│ 🚦 Trânsito: ${eta.trafficCondition}`);
  console.log(`│ 🌤️  Clima: ${eta.weatherCondition}`);
  console.log(`└──────────────────────────────────────────────────────────────┘`);
}

function showMainMenu(): void {
  console.clear();
  console.log('🎯 ═══════════════════════════════════════════════════════════');
  console.log('🎯              ETA SERVICE - MODO INTERATIVO                ');
  console.log('🎯 ═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('📍 Destino atual:', currentDestination.name);
  console.log('📍 Coordenadas:', currentDestination.lat, currentDestination.lon);
  console.log('🚗 Veículos conectados:', connectedVehicles.length > 0 ? connectedVehicles.join(', ') : 'Nenhum');
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                    COMANDOS DISPONÍVEIS                   ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║ 1. eta [vehicle]    → Calcular ETA para veículo          ║');
  console.log('║ 2. eta-all          → Calcular ETA para todos            ║');
  console.log('║ 3. list             → Listar veículos conectados         ║');
  console.log('║ 4. dest [local]     → Mudar destino                      ║');
  console.log('║ 5. locations        → Ver locais disponíveis             ║');
  console.log('║ 6. coord [lat] [lon]→ Definir coord. personalizada       ║');
  console.log('║ 7. monitor          → Monitorar ETAs em tempo real       ║');
  console.log('║ 8. compare          → Comparar todos os veículos          ║');
  console.log('║ 9. help             → Mostrar ajuda detalhada            ║');
  console.log('║ 0. clear            → Limpar tela                        ║');
  console.log('║ q. quit             → Sair                               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
}

function showLocations(): void {
  console.log('\n📍 LOCAIS DISPONÍVEIS:');
  console.log('┌────────────────┬─────────────────────────┬─────────────────────┐');
  console.log('│ Código         │ Nome                    │ Coordenadas         │');
  console.log('├────────────────┼─────────────────────────┼─────────────────────┤');
  
  Object.entries(LOCATIONS).forEach(([code, loc]) => {
    const coords = `${loc.lat}, ${loc.lon}`;
    console.log(`│ ${code.padEnd(14)} │ ${loc.name.padEnd(23)} │ ${coords.padEnd(19)} │`);
  });
  
  console.log('└────────────────┴─────────────────────────┴─────────────────────┘');
  console.log('\nUso: dest [código] (ex: dest recife)');
  console.log('');
}

function updateVehicleList(): Promise<void> {
  return new Promise((resolve) => {
    trackingClient.ListVehicles({}, (error: any, response: any) => {
      if (!error && response.vehicles) {
        connectedVehicles = response.vehicles.map((v: any) => v.vehicleId);
      } else {
        connectedVehicles = [];
      }
      resolve();
    });
  });
}

function calculateSingleETA(vehicleId: string): void {
  console.log(`\n⏰ Calculando ETA para veículo: ${vehicleId}`);
  console.log(`🎯 Destino: ${currentDestination.name}`);
  console.log('─'.repeat(60));

  const request = {
    vehicleId: vehicleId,
    destinationLat: currentDestination.lat,
    destinationLon: currentDestination.lon
  };

  etaClient.CalculateETA(request, (error: any, response: any) => {
    if (error) {
      console.error(`❌ Erro ao calcular ETA: ${error.message}`);
      return;
    }
    
    formatETA(response);
    console.log(`\n🕐 Calculado em: ${new Date(response.calculatedAt).toLocaleString('pt-BR')}`);
  });
}

function calculateAllETAs(): void {
  console.log(`\n⏰ Calculando ETA para todos os veículos`);
  console.log(`🎯 Destino: ${currentDestination.name}`);
  console.log('═'.repeat(60));

  const request = {
    destinationLat: currentDestination.lat,
    destinationLon: currentDestination.lon
  };

  etaClient.GetMultipleETAs(request, (error: any, response: any) => {
    if (error) {
      console.error(`❌ Erro ao calcular ETAs: ${error.message}`);
      return;
    }

    const etas = response.etas || [];
    
    if (etas.length === 0) {
      console.log('📭 Nenhum veículo ativo encontrado');
      return;
    }

    console.log(`\n🏆 RANKING DE CHEGADA (${etas.length} veículo${etas.length > 1 ? 's' : ''}):`);
    
    etas.forEach((eta: any, index: number) => {
      console.log(`\n${index + 1}º lugar:`);
      formatETA(eta);
    });

    // Estatísticas
    const times = etas.map((eta: any) => eta.estimatedMinutes);
    const avgTime = times.reduce((a: number, b: number) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    console.log('\n📊 ESTATÍSTICAS GERAIS:');
    console.log('┌─────────────────────────────────────────────────────────────┐');
    console.log(`│ ⚡ Mais rápido: ${minTime} minutos`);
    console.log(`│ 🐌 Mais lento: ${maxTime} minutos`);
    console.log(`│ 📈 Tempo médio: ${avgTime.toFixed(1)} minutos`);
    console.log(`│ 📊 Diferença: ${maxTime - minTime} minutos`);
    console.log('└─────────────────────────────────────────────────────────────┘');
    console.log(`\n🕐 Calculado em: ${new Date(response.calculatedAt).toLocaleString('pt-BR')}`);
  });
}

function startMonitoring(): void {
  console.log('\n🔄 MODO MONITOR INICIADO');
  console.log('Atualizando ETAs a cada 10 segundos...');
  console.log('Pressione ENTER para parar o monitoramento\n');

  const monitorInterval = setInterval(() => {
    console.log(`\n⏰ [${new Date().toLocaleString('pt-BR')}] Atualizando ETAs...`);
    calculateAllETAs();
  }, 10000);

  // Para o monitoramento quando o usuário pressionar ENTER
  const originalHandler = rl.listeners('line')[0];
  rl.removeAllListeners('line');
  
  rl.once('line', () => {
    clearInterval(monitorInterval);
    console.log('\n✅ Monitoramento interrompido');
    rl.on('line', originalHandler as (...args: any[]) => void);
  });
}

function compareVehicles(): void {
  console.log('\n📊 COMPARAÇÃO DETALHADA DE VEÍCULOS');
  console.log('═'.repeat(60));

  const request = {
    destinationLat: currentDestination.lat,
    destinationLon: currentDestination.lon
  };

  etaClient.GetMultipleETAs(request, (error: any, response: any) => {
    if (error) {
      console.error(`❌ Erro: ${error.message}`);
      return;
    }

    const etas = response.etas || [];
    
    if (etas.length === 0) {
      console.log('📭 Nenhum veículo para comparar');
      return;
    }

    console.log('\n📋 TABELA COMPARATIVA:');
    console.log('┌────────────┬─────────┬──────────┬─────────┬─────────────────────┐');
    console.log('│ Veículo    │ Dist(km)│ Vel(km/h)│ ETA(min)│ Chegada             │');
    console.log('├────────────┼─────────┼──────────┼─────────┼─────────────────────┤');

    etas.forEach((eta: any) => {
      const vehicle = eta.vehicleId.padEnd(10);
      const distance = eta.distanceKm.toString().padStart(7);
      const speed = eta.currentSpeed.toString().padStart(8);
      const time = eta.estimatedMinutes.toString().padStart(7);
      const arrival = new Date(eta.arrivalTime).toLocaleTimeString('pt-BR');
      
      console.log(`│ ${vehicle} │ ${distance} │ ${speed} │ ${time} │ ${arrival.padEnd(19)} │`);
    });

    console.log('└────────────┴─────────┴──────────┴─────────┴─────────────────────┘');

    // Análise de eficiência
    const sortedBySpeed = [...etas].sort((a, b) => b.currentSpeed - a.currentSpeed);
    const sortedByDistance = [...etas].sort((a, b) => a.distanceKm - b.distanceKm);

    console.log('\n🔍 ANÁLISES:');
    console.log(`🚀 Mais rápido: ${sortedBySpeed[0].vehicleId} (${sortedBySpeed[0].currentSpeed} km/h)`);
    console.log(`📍 Mais próximo: ${sortedByDistance[0].vehicleId} (${sortedByDistance[0].distanceKm} km)`);
    console.log(`⏱️  Chegará primeiro: ${etas[0].vehicleId} (${etas[0].estimatedMinutes} min)`);
  });
}

function showHelp(): void {
  console.log('\n📖 AJUDA DETALHADA:');
  console.log('');
  console.log('🎯 COMANDOS DE ETA:');
  console.log('  eta carro-01        → Calcula ETA para o veículo específico');
  console.log('  eta-all             → Calcula ETA para todos os veículos');
  console.log('');
  console.log('📍 COMANDOS DE DESTINO:');
  console.log('  dest recife         → Muda destino para Centro do Recife');
  console.log('  dest campus-recife  → Muda destino para Campus Recife');
  console.log('  coord -8.05 -34.88  → Define coordenadas personalizadas');
  console.log('');
  console.log('🔄 COMANDOS DE MONITORAMENTO:');
  console.log('  monitor             → Inicia monitoramento automático');
  console.log('  compare             → Compara todos os veículos em tabela');
  console.log('');
  console.log('ℹ️  COMANDOS AUXILIARES:');
  console.log('  list                → Lista veículos conectados');
  console.log('  locations           → Mostra todos os locais disponíveis');
  console.log('  clear               → Limpa a tela');
  console.log('');
  console.log('💡 DICAS:');
  console.log('  • Use "eta" sem parâmetros para ver veículos disponíveis');
  console.log('  • O monitor atualiza automaticamente a cada 10 segundos');
  console.log('  • Coordenadas personalizadas são mantidas até mudança');
  console.log('');
}

async function handleCommand(input: string): Promise<void> {
  const parts = input.trim().split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  await updateVehicleList();

  switch (command) {
    case 'eta':
      if (args.length === 0) {
        if (connectedVehicles.length === 0) {
          console.log('❌ Nenhum veículo conectado. Use "list" para verificar.');
        } else {
          console.log('🚗 Veículos disponíveis:', connectedVehicles.join(', '));
          console.log('💡 Use: eta [nome-do-veiculo]');
        }
      } else {
        const vehicleId = args[0];
        if (connectedVehicles.includes(vehicleId)) {
          calculateSingleETA(vehicleId);
        } else {
          console.log(`❌ Veículo "${vehicleId}" não encontrado.`);
          console.log('🚗 Veículos disponíveis:', connectedVehicles.join(', '));
        }
      }
      break;

    case 'eta-all':
      calculateAllETAs();
      break;

    case 'list':
      await updateVehicleList();
      if (connectedVehicles.length === 0) {
        console.log('📭 Nenhum veículo conectado no momento');
        console.log('💡 Certifique-se que o vehicle-grpc-client está rodando');
      } else {
        console.log('\n🚗 VEÍCULOS CONECTADOS:');
        connectedVehicles.forEach((vehicle, index) => {
          console.log(`  ${index + 1}. ${vehicle}`);
        });
      }
      break;

    case 'dest':
      if (args.length === 0) {
        console.log('❌ Especifique um destino. Use "locations" para ver opções.');
      } else {
        const locationKey = args[0].toLowerCase();
        const location = LOCATIONS[locationKey];
        if (location) {
          currentDestination = location;
          console.log(`✅ Destino alterado para: ${currentDestination.name}`);
          console.log(`📍 Coordenadas: ${currentDestination.lat}, ${currentDestination.lon}`);
        } else {
          console.log(`❌ Local "${args[0]}" não encontrado.`);
          console.log('💡 Use "locations" para ver os locais disponíveis.');
        }
      }
      break;

    case 'coord':
      if (args.length !== 2) {
        console.log('❌ Use: coord [latitude] [longitude]');
        console.log('💡 Exemplo: coord -8.0476 -34.8770');
      } else {
        const lat = parseFloat(args[0]);
        const lon = parseFloat(args[1]);
        if (isNaN(lat) || isNaN(lon)) {
          console.log('❌ Coordenadas inválidas. Use números válidos.');
        } else {
          currentDestination = { lat, lon, name: 'Coordenadas Personalizadas' };
          console.log(`✅ Destino definido para coordenadas personalizadas`);
          console.log(`📍 Latitude: ${lat}, Longitude: ${lon}`);
        }
      }
      break;

    case 'locations':
      showLocations();
      break;

    case 'monitor':
      startMonitoring();
      break;

    case 'compare':
      compareVehicles();
      break;

    case 'help':
      showHelp();
      break;

    case 'clear':
      showMainMenu();
      break;

    case 'q':
    case 'quit':
      console.log('👋 Encerrando ETA Service interativo...');
      rl.close();
      process.exit(0);
      break;

    case '':
      // Comando vazio, não faz nada
      break;

    default:
      console.log(`❓ Comando "${command}" não reconhecido.`);
      console.log('💡 Use "help" para ver todos os comandos disponíveis.');
      break;
  }
}

async function main(): Promise<void> {
  console.log('🚀 Conectando aos serviços...');
  await updateVehicleList();
  
  showMainMenu();
  
  console.log('Digite um comando (ou "help" para ajuda):');
  
  rl.on('line', async (input) => {
    try {
      await handleCommand(input);
    } catch (error) {
      console.error('❌ Erro ao executar comando:', error);
    }
    
    setTimeout(() => {
      console.log('\n' + '─'.repeat(40));
      console.log('Digite próximo comando (ou "help" para ajuda):');
    }, 500);
  });
}

// Tratamento de sinais
process.on('SIGINT', () => {
  console.log('\n👋 Encerrando...');
  rl.close();
  process.exit(0);
});

main().catch(console.error);
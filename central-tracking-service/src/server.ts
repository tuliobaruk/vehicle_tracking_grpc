import path from "path";
import * as grpc from "@grpc/grpc-js";
const protoLoader = require("@grpc/proto-loader");

const PROTO_PATH = path.resolve(__dirname, "../protos/tracking.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const trackingProto = grpc.loadPackageDefinition(packageDefinition) as any;

// Armazenamento em memória dos veículos conectados
const connectedVehicles = new Map<string, any>();
const vehicleHistory = new Map<string, any[]>();
const vehicleStats = new Map<
  string,
  { lastSpeed: number; speedChanges: number; lastUpdate: number }
>();

function streamLocation(call: grpc.ServerDuplexStream<any, any>) {
  let vehicleId: string | null = null;

  call.on("data", (update) => {
    vehicleId = update.vehicleId;

    // Armazena a conexão do veículo, se o ID não for nulo
    if (!vehicleId) {
      // Se vehicleId for inválido, ignore este update
      return;
    }
    connectedVehicles.set(vehicleId, call);

    // Corrige o timestamp se necessário
    const timestamp = parseInt(update.timestamp) || Date.now();

    // Tracking de mudanças de velocidade
    const currentStats = vehicleStats.get(vehicleId) || {
      lastSpeed: update.vel,
      speedChanges: 0,
      lastUpdate: timestamp,
    };

    // Detecta mudança significativa de velocidade
    const speedDifference = Math.abs(update.vel - currentStats.lastSpeed);
    const isSignificantSpeedChange = speedDifference >= 10;

    if (isSignificantSpeedChange) {
      currentStats.speedChanges++;
    }

    vehicleStats.set(vehicleId, {
      lastSpeed: update.vel,
      speedChanges: currentStats.speedChanges,
      lastUpdate: timestamp,
    });

    // Armazena histórico de localizações
    if (!vehicleHistory.has(vehicleId)) {
      vehicleHistory.set(vehicleId, []);
    }
    const history = vehicleHistory.get(vehicleId)!;
    history.push({
      lat: update.lat,
      lon: update.lon,
      vel: update.vel,
      timestamp: timestamp,
      receivedAt: Date.now(),
    });

    // Mantém apenas os últimos 100 pontos
    if (history.length > 100) {
      history.shift();
    }

    // Log compacto e consistente
    const timeStr = new Date(timestamp).toLocaleString("pt-BR");
    const positionStr = `${update.lat.toFixed(6)}, ${update.lon.toFixed(6)}`;

    console.log(
      `[${timeStr}] 🚗 ${vehicleId}: ${positionStr} | ${update.vel} km/h`
    );

    // Mostra mudanças de velocidade significativas
    if (isSignificantSpeedChange) {
      const direction = update.vel > currentStats.lastSpeed ? "🚀" : "🐌";
      console.log(
        `  ${direction} Velocidade: ${currentStats.lastSpeed} → ${update.vel} km/h`
      );
    }

    // Simula comandos baseados na velocidade (menos frequentes)
    let command = null;
    const timeSinceLastCommand = timestamp - (currentStats.lastUpdate || 0);

    // Só envia comandos se passou tempo suficiente (30 segundos) e não mudou recentemente
    if (timeSinceLastCommand > 30000 && !isSignificantSpeedChange) {
      if (update.vel > 85) {
        command = "REDUZIR_VELOCIDADE";
        console.log(
          `  ⚠️  COMANDO: Reduzir velocidade (${update.vel} km/h muito alta)`
        );
      } else if (update.vel < 15) {
        command = "ACELERAR";
        console.log(`  🚀 COMANDO: Acelerar (${update.vel} km/h muito baixa)`);
      }
    }

    // Responde ao cliente com confirmação e possível comando
    const response = {
      vehicleId: update.vehicleId,
      lat: update.lat,
      lon: update.lon,
      vel: update.vel,
      timestamp: Date.now(),
      command: command,
      status: "TRACKING_ACTIVE",
    };

    call.write(response);
  });

  call.on("end", () => {
    if (vehicleId) {
      console.log(`🔌 Veículo ${vehicleId} desconectado`);
      connectedVehicles.delete(vehicleId);
    }
    call.end();
  });

  call.on("error", (error) => {
    console.error(
      `❌ Erro na conexão${vehicleId ? ` com ${vehicleId}` : ""}:`,
      error.message
    );
    if (vehicleId) {
      connectedVehicles.delete(vehicleId);
    }
  });
}

// Endpoint para obter status dos veículos (usado pelo serviço de ETA)
function getVehicleStatus(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  const vehicleId = call.request.vehicleId;
  const history = vehicleHistory.get(vehicleId) || [];
  const isConnected = connectedVehicles.has(vehicleId);
  const stats = vehicleStats.get(vehicleId);

  const lastPosition = history.length > 0 ? history[history.length - 1] : null;

  callback(null, {
    vehicleId: vehicleId,
    isConnected: isConnected,
    lastPosition: lastPosition,
    totalPoints: history.length,
    speedChanges: stats?.speedChanges || 0,
    status: isConnected ? "ONLINE" : "OFFLINE",
  });
}

// Endpoint para listar todos os veículos
function listVehicles(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  const vehicles = Array.from(connectedVehicles.keys()).map((vehicleId) => {
    const history = vehicleHistory.get(vehicleId) || [];
    const stats = vehicleStats.get(vehicleId);
    const lastPosition =
      history.length > 0 ? history[history.length - 1] : null;

    return {
      vehicleId: vehicleId,
      isConnected: true,
      lastPosition: lastPosition,
      totalPoints: history.length,
      speedChanges: stats?.speedChanges || 0,
      status: "ONLINE",
    };
  });

  callback(null, { vehicles: vehicles });
}

// Endpoint para enviar comando manual para um veículo
function sendCommand(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  const vehicleId = call.request.vehicleId;
  const command = call.request.command;

  if (!connectedVehicles.has(vehicleId)) {
    callback({
      code: grpc.status.NOT_FOUND,
      message: `Veículo ${vehicleId} não encontrado ou offline`,
    });
    return;
  }

  const vehicleCall = connectedVehicles.get(vehicleId);

  // Envia comando para o veículo
  const response = {
    vehicleId: vehicleId,
    command: command,
    timestamp: Date.now(),
    status: "COMMAND_SENT",
  };

  console.log(`📡 COMANDO MANUAL enviado para ${vehicleId}: ${command}`);

  try {
    vehicleCall.write(response);
    callback(null, {
      success: true,
      message: `Comando ${command} enviado para ${vehicleId}`,
    });
  } catch (error) {
    callback({
      code: grpc.status.INTERNAL,
      message: `Erro ao enviar comando: ${error}`,
    });
  }
}

function main() {
  const server = new grpc.Server();

  server.addService(trackingProto.tracking.Tracker.service, {
    StreamLocation: streamLocation,
    GetVehicleStatus: getVehicleStatus,
    ListVehicles: listVehicles,
    SendCommand: sendCommand,
  });

  const port = "0.0.0.0:50051";
  server.bindAsync(
    port,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error("❌ Erro ao iniciar servidor:", error);
        return;
      }

      console.log("🎯 Central de Rastreamento iniciada!");
      console.log(`🌐 Servidor rodando na porta: ${port}`);
      console.log("📡 Aguardando conexões de veículos...");
      console.log("=".repeat(50));

      // Status periódico mais detalhado
      setInterval(() => {
        const connectedCount = connectedVehicles.size;
        const totalVehicles = vehicleHistory.size;

        if (connectedCount > 0) {
          console.log(`\n📊 STATUS GERAL:`);
          console.log(
            `🚗 ${connectedCount} veículo(s) online de ${totalVehicles} total`
          );

          // Mostra velocidade atual de cada veículo
          connectedVehicles.forEach((_, vehicleId) => {
            const history = vehicleHistory.get(vehicleId) || [];
            const stats = vehicleStats.get(vehicleId);
            if (history.length > 0) {
              const lastPos = history[history.length - 1];
              const speedChanges = stats?.speedChanges || 0;
              console.log(
                `  • ${vehicleId}: ${lastPos.vel} km/h (${speedChanges} mudanças)`
              );
            }
          });
          console.log("");
        }
      }, 60000); // A cada 1 minuto
    }
  );
}

main();

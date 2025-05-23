import path from "path";
import * as grpc from "@grpc/grpc-js";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
const protoLoader = require("@grpc/proto-loader");

const PROTO_PATH = path.resolve(__dirname, "../../protos/tracking.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const trackingProto = grpc.loadPackageDefinition(packageDefinition) as any;

const prisma = new PrismaClient({
  log: ["error", "warn"],
});

// Cache em memória para conexões ativas (performance)
const activeConnections = new Map<string, grpc.ServerDuplexStream<any, any>>();
const SERVER_INSTANCE = `server-${Date.now()}-${Math.random()
  .toString(36)}`;

// Inicialização do banco e conexão
async function initializeDatabase() {
  try {
    await prisma.$connect();
    console.log("✅ Prisma conectado ao PostgreSQL");

    // Limpa conexões antigas ao iniciar
    await cleanupStaleConnections();

    // Agenda limpeza periódica
    setInterval(cleanupStaleConnections, 60000); // a cada 1 minuto
  } catch (error) {
    console.error("❌ Erro ao conectar com PostgreSQL via Prisma:", error);
    process.exit(1);
  }
}

async function cleanupStaleConnections() {
  try {
    const staleMinutes = 2;
    const staleThreshold = new Date(Date.now() - staleMinutes * 60 * 1000);

    const deletedConnections = await prisma.activeConnection.deleteMany({
      where: {
        lastPing: {
          lt: staleThreshold,
        },
      },
    });

    if (deletedConnections.count > 0) {
      console.log(
        `🧹 Limpeza: ${deletedConnections.count} conexões antigas removidas`
      );
    }

    const updatedVehicles = await prisma.vehicle.updateMany({
      where: {
        isActive: true,
        activeConnection: null, // Veículos sem conexão ativa
      },
      data: {
        isActive: false,
        lastSeenAt: new Date(),
      },
    });

    if (updatedVehicles.count > 0) {
      console.log(
        `🔄 Marcados como inativos: ${updatedVehicles.count} veículos`
      );
    }
  } catch (error) {
    console.error("❌ Erro na limpeza de conexões:", error);
  }
}

// Registra veículo (upsert) usando Prisma - CORRIGIDO
async function upsertVehicle(vehicleId: string) {
  try {
    const vehicle = await prisma.vehicle.upsert({
      where: { vehicleId },
      update: {
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        vehicleId,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        isActive: true,
        totalPoints: 0,
        currentSpeed: 0,
      },
    });

    console.log(`✅ Veículo ${vehicleId} registrado/atualizado no banco`);
    return vehicle;
  } catch (error) {
    console.error(`❌ Erro ao registrar veículo ${vehicleId}:`, error);
    throw error;
  }
}

// Registra conexão ativa - CORRIGIDO: Garante que veículo existe primeiro
async function registerActiveConnection(vehicleId: string): Promise<boolean> {
  try {
    // PASSO 1: Garantir que o veículo existe ANTES de criar a conexão
    await upsertVehicle(vehicleId);

    // PASSO 2: Verificar se já existe conexão para este veículo
    const existingConnection = await prisma.activeConnection.findUnique({
      where: { vehicleId },
    });

    // CORREÇÃO AQUI: Rejeitar conexão duplicada independente da instância
    if (existingConnection) {
      // Verificar se a conexão está ativa ou é antiga
      const staleMinutes = 2;
      const staleThreshold = new Date(Date.now() - staleMinutes * 60 * 1000);

      if (existingConnection.lastPing >= staleThreshold) {
        // Conexão já existe e está ativa
        console.log(
          `⚠️ Veículo ${vehicleId} já conectado na instância: ${existingConnection.serverInstance}`
        );
        return false;
      } else {
        // Conexão existe mas está obsoleta, podemos sobrescrever
        console.log(
          `ℹ️ Veículo ${vehicleId} tinha conexão obsoleta, substituindo...`
        );
      }
    }

    // PASSO 3: Criar ou atualizar conexão (agora o veículo já existe)
    await prisma.activeConnection.upsert({
      where: { vehicleId },
      update: {
        connectedAt: new Date(),
        lastPing: new Date(),
        serverInstance: SERVER_INSTANCE,
      },
      create: {
        vehicleId,
        connectedAt: new Date(),
        lastPing: new Date(),
        serverInstance: SERVER_INSTANCE,
      },
    });

    console.log(`🔗 Conexão registrada para ${vehicleId}`);
    return true;
  } catch (error) {
    console.error(`❌ Erro ao registrar conexão para ${vehicleId}:`, error);
    return false;
  }
}

async function removeActiveConnection(vehicleId: string) {
  try {
    await prisma.activeConnection.delete({
      where: { vehicleId },
    });
    console.log(`🔌 Conexão removida: ${vehicleId}`);
  } catch (error) {
    console.log(`ℹ️ Conexão ${vehicleId} já estava removida`);
  }
}

async function updateConnectionPing(vehicleId: string) {
  try {
    await prisma.activeConnection.update({
      where: { vehicleId },
      data: { lastPing: new Date() },
    });
  } catch (error) {
  }
}

async function saveVehiclePosition(
  vehicleId: string,
  lat: number,
  lon: number,
  vel: number,
  timestamp: number
) {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.vehiclePosition.create({
        data: {
          vehicleId,
          lat: new Decimal(lat.toString()),
          lon: new Decimal(lon.toString()),
          speed: vel,
          timestamp: BigInt(timestamp),
          receivedAt: new Date(),
        },
      });

      // Atualiza veículo com posição atual
      await tx.vehicle.update({
        where: { vehicleId },
        data: {
          currentLat: new Decimal(lat.toString()),
          currentLon: new Decimal(lon.toString()),
          currentSpeed: vel,
          totalPoints: { increment: 1 },
          lastSeenAt: new Date(),
        },
      });
    });
  } catch (error) {
    console.error(`❌ Erro ao salvar posição para ${vehicleId}:`, error);
  }
}
function streamLocation(call: grpc.ServerDuplexStream<any, any>) {
  let vehicleId: string | null = null;

  call.on("data", async (update) => {
    vehicleId = update.vehicleId;

    if (!vehicleId) {
      console.log("⚠️ VehicleId vazio, ignorando update");
      return;
    }

    // Primeira conexão do veículo
    if (!activeConnections.has(vehicleId)) {

      console.log(`🚗 Nova conexão: ${vehicleId}`);

      // Registra conexão (que internamente garante que o veículo existe)
      const connectionRegistered = await registerActiveConnection(vehicleId);

      if (!connectionRegistered) {
        console.log(
          `❌ CONFLITO: Veículo ${vehicleId} já conectado!`
        );

        // Envia erro e fecha conexão
        call.write({
          vehicleId: vehicleId,
          command: "CONFLITO_ID",
          status: "ERROR_DUPLICATE_ID",
          timestamp: Date.now(),
        });

        setTimeout(() => call.end(), 1000);
        return;
      }

      activeConnections.set(vehicleId, call);
      console.log(`✅ Veículo ${vehicleId} conectado com sucesso`);
    } else if (activeConnections.get(vehicleId) !== call) {
      console.log(
        `❌ CONFLITO: Veículo ${vehicleId} já conectado com outra sessão!`
      );

      call.write({
        vehicleId: vehicleId,
        command: "CONFLITO_ID",
        status: "ERROR_DUPLICATE_ID",
        timestamp: Date.now(),
      });

      setTimeout(() => call.end(), 1000);
      return;
    }

    await updateConnectionPing(vehicleId);

    const timestamp = parseInt(update.timestamp) || Date.now();
    const timeStr = new Date(timestamp).toLocaleString("pt-BR");
    const positionStr = `${update.lat.toFixed(6)}, ${update.lon.toFixed(6)}`;

    console.log(
      `[${timeStr}] 🚗 ${vehicleId}: ${positionStr} | ${update.vel} km/h`
    );

    await saveVehiclePosition(
      vehicleId,
      update.lat,
      update.lon,
      update.vel,
      timestamp
    );

    let command = null;

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

  call.on("end", async () => {
    if (vehicleId) {
      console.log(`🔌 Veículo ${vehicleId} desconectado`);
      activeConnections.delete(vehicleId);
      await removeActiveConnection(vehicleId);
    }
    call.end();
  });

  call.on("error", async (error) => {
    console.error(
      `❌ Erro na conexão${vehicleId ? ` com ${vehicleId}` : ""}:`,
      error.message
    );
    if (vehicleId) {
      activeConnections.delete(vehicleId);
      await removeActiveConnection(vehicleId);
    }
  });
}

async function getVehicleStatus(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  const vehicleId = call.request.vehicleId;

  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { vehicleId },
      include: {
        activeConnection: true,
      },
    });

    if (!vehicle) {
      callback({
        code: grpc.status.NOT_FOUND,
        message: `Veículo ${vehicleId} não encontrado`,
      });
      return;
    }

    const lastPosition =
      vehicle.currentLat && vehicle.currentLon
        ? {
            lat: parseFloat(vehicle.currentLat.toString()),
            lon: parseFloat(vehicle.currentLon.toString()),
            vel: vehicle.currentSpeed,
            timestamp: Date.now(),
            receivedAt: Date.now(),
          }
        : null;

    callback(null, {
      vehicleId: vehicle.vehicleId,
      isConnected: !!vehicle.activeConnection,
      lastPosition: lastPosition,
      totalPoints: vehicle.totalPoints,
      status: vehicle.activeConnection ? "ONLINE" : "OFFLINE",
    });
  } catch (error) {
    console.error("❌ Erro ao buscar status do veículo:", error);
    callback({
      code: grpc.status.INTERNAL,
      message: "Erro interno ao buscar status do veículo",
    });
  }
}

// Endpoint para listar todos os veículos
async function listVehicles(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { isActive: true },
      include: {
        activeConnection: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });

    const vehicleList = vehicles.map((vehicle) => ({
      vehicleId: vehicle.vehicleId,
      isConnected: !!vehicle.activeConnection,
      lastPosition:
        vehicle.currentLat && vehicle.currentLon
          ? {
              lat: parseFloat(vehicle.currentLat.toString()),
              lon: parseFloat(vehicle.currentLon.toString()),
              vel: vehicle.currentSpeed,
              timestamp: Date.now(),
              receivedAt: Date.now(),
            }
          : null,
      totalPoints: vehicle.totalPoints,
      status: vehicle.activeConnection ? "ONLINE" : "OFFLINE",
    }));

    callback(null, { vehicles: vehicleList });
  } catch (error) {
    console.error("❌ Erro ao listar veículos:", error);
    callback({
      code: grpc.status.INTERNAL,
      message: "Erro interno ao listar veículos",
    });
  }
}

async function getFleetStatistics() {
  try {
    const stats = await prisma.$transaction(async (tx) => {
      const totalVehicles = await tx.vehicle.count();
      const activeVehicles = await tx.vehicle.count({
        where: { isActive: true },
      });
      const connectedVehicles = await tx.activeConnection.count();

      const positionsLast5Min = await tx.vehiclePosition.count({
        where: {
          receivedAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000),
          },
        },
      });

      const totalPositions = await tx.vehiclePosition.count();

      return {
        totalVehicles,
        activeVehicles,
        connectedVehicles,
        positionsLast5Min,
        totalPositions,
      };
    });

    return stats;
  } catch (error) {
    console.error("❌ Erro ao calcular estatísticas:", error);
    return null;
  }
}

function main() {
  const server = new grpc.Server();

  server.addService(trackingProto.tracking.Tracker.service, {
    StreamLocation: streamLocation,
    GetVehicleStatus: getVehicleStatus,
    ListVehicles: listVehicles,
  });

  const port = "0.0.0.0:50051";
  server.bindAsync(
    port,
    grpc.ServerCredentials.createInsecure(),
    async (error, port) => {
      if (error) {
        console.error("❌ Erro ao iniciar servidor:", error);
        return;
      }

      // Inicializa banco de dados
      await initializeDatabase();

      console.log("🎯 Central de Rastreamento com Prisma ORM iniciada!");
      console.log(`🌐 Servidor rodando na porta: ${port}`);
      console.log(`🗄️ Instância do servidor: ${SERVER_INSTANCE}`);
      console.log("📡 Aguardando conexões de veículos...");
      console.log("=".repeat(50));

      // Status periódico com Prisma
      setInterval(async () => {
        try {
          const stats = await getFleetStatistics();

          if (stats && stats.connectedVehicles > 0) {
            console.log(`\n📊 STATUS PRISMA:`);
            console.log(
              `🚗 ${stats.connectedVehicles} veículo(s) conectado(s) de ${stats.activeVehicles} ativos`
            );
            console.log(
              `📍 ${stats.positionsLast5Min} posições nos últimos 5 min`
            );
            console.log(
              `📈 ${stats.totalPositions} posições no histórico total`
            );

            // Mostra veículos conectados
            const connectedVehicles = await prisma.vehicle.findMany({
              where: {
                activeConnection: { isNot: null },
              },
              include: { activeConnection: true },
              orderBy: { lastSeenAt: "desc" },
            });

            connectedVehicles.forEach((vehicle) => {
              console.log(
                `  • ${vehicle.vehicleId}: ${vehicle.currentSpeed} km/h (${vehicle.totalPoints} pontos)`
              );
            });
            console.log("");
          }
        } catch (error) {
          console.error("❌ Erro no status periódico:", error);
        }
      }, 60000); // A cada 1 minuto
    }
  );
}

process.on("SIGINT", async () => {
  console.log("\n🛑 Encerrando servidor...");
  try {
    await prisma.$disconnect();
    console.log("✅ Prisma desconectado");
  } catch (error) {
    console.error("❌ Erro ao desconectar Prisma:", error);
  }
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("\n🛑 Recebido SIGTERM...");
  try {
    await prisma.$disconnect();
    console.log("✅ Prisma desconectado");
  } catch (error) {
    console.error("❌ Erro ao desconectar Prisma:", error);
  }
  process.exit(0);
});

main();

import path from "path";
import * as grpc from "@grpc/grpc-js";
const protoLoader = require("@grpc/proto-loader");

const PROTO_PATH = path.resolve(__dirname, "../protos/eta.proto");
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const etaProto = grpc.loadPackageDefinition(packageDefinition) as any;

// Cliente para comunicar com a Central de Rastreamento
const TRACKING_PROTO_PATH = path.resolve(__dirname, "../protos/tracking.proto");
const trackingPackageDef = protoLoader.loadSync(TRACKING_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const trackingProto = grpc.loadPackageDefinition(trackingPackageDef) as any;
const trackingClient = new trackingProto.tracking.Tracker(
  "localhost:50051",
  grpc.credentials.createInsecure()
);

// Função para calcular distância entre dois pontos (fórmula de Haversine)
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Raio da Terra em km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Cache para condições estáveis por período
const conditionsCache = new Map<
  string,
  { traffic: any; weather: any; timestamp: number }
>();
const CACHE_DURATION = 60000; // 1 minuto de cache

// Função para simular condições de trânsito (mais estável)
function getTrafficCondition(vehicleId?: string): {
  factor: number;
  description: string;
} {
  const conditions = [
    { factor: 1.0, description: "Trânsito livre" },
    { factor: 1.2, description: "Trânsito leve" },
    { factor: 1.5, description: "Trânsito moderado" },
    { factor: 2.0, description: "Trânsito intenso" },
    { factor: 2.5, description: "Trânsito muito intenso" },
  ];

  // Usa cache se disponível e ainda válido
  const cacheKey = `traffic_${vehicleId || "global"}`;
  const cached = conditionsCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.traffic;
  }

  // Simula condições baseadas no horário (mais determinístico)
  const hour = new Date().getHours();
  let conditionIndex;

  if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
    // Horário de pico - usa hash do veículo para consistência
    const hash = vehicleId ? vehicleId.charCodeAt(vehicleId.length - 1) % 2 : 0;
    conditionIndex = 3 + hash; // intenso ou muito intenso
  } else if (hour >= 10 && hour <= 16) {
    // Meio do dia - usa hash para consistência
    const hash = vehicleId ? vehicleId.charCodeAt(0) % 3 : 1;
    conditionIndex = 1 + hash; // leve a moderado
  } else {
    // Madrugada ou noite - usa hash para consistência
    const hash = vehicleId ? vehicleId.charCodeAt(vehicleId.length - 1) % 2 : 0;
    conditionIndex = hash; // livre ou leve
  }

  const result = conditions[conditionIndex];

  // Atualiza cache
  const cacheData = conditionsCache.get(cacheKey) || {
    traffic: result,
    weather: null,
    timestamp: now,
  };
  cacheData.traffic = result;
  cacheData.timestamp = now;
  conditionsCache.set(cacheKey, cacheData);

  return result;
}

// Função para simular condições climáticas (mais estável)
function getWeatherCondition(vehicleId?: string): {
  factor: number;
  description: string;
} {
  const conditions = [
    { factor: 1.0, description: "Tempo bom" },
    { factor: 1.1, description: "Nublado" },
    { factor: 1.3, description: "Chuva leve" },
    { factor: 1.6, description: "Chuva forte" },
    { factor: 2.0, description: "Tempestade" },
  ];

  // Usa cache se disponível e ainda válido
  const cacheKey = `weather_${vehicleId || "global"}`;
  const cached = conditionsCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_DURATION) {
    return cached.weather;
  }

  // Gera condição baseada em hash do veículo para consistência
  let conditionIndex;
  if (vehicleId) {
    // Usa hash do ID do veículo para ter resultado consistente
    const hash = vehicleId
      .split("")
      .reduce((acc, char) => acc + char.charCodeAt(0), 0);

    // 60% chance de tempo bom, 40% de outras condições
    if (hash % 10 < 6) {
      conditionIndex = 0; // Tempo bom
    } else {
      conditionIndex = 1 + (hash % 4); // Outras condições
    }
  } else {
    // Fallback para condição global
    const hour = new Date().getHours();
    conditionIndex = hour % 2 === 0 ? 0 : 1;
  }

  const result = conditions[conditionIndex];

  // Atualiza cache
  const cacheData = conditionsCache.get(cacheKey) || {
    traffic: null,
    weather: result,
    timestamp: now,
  };
  cacheData.weather = result;
  cacheData.timestamp = now;
  conditionsCache.set(cacheKey, cacheData);

  return result;
}

function calculateETA(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  const request = call.request;
  const vehicleId = request.vehicleId;
  const destinationLat = request.destinationLat;
  const destinationLon = request.destinationLon;

  console.log(`📍 Calculando ETA para veículo ${vehicleId}`);
  console.log(`🎯 Destino: ${destinationLat}, ${destinationLon}`);

  // Consulta a posição atual do veículo na Central de Rastreamento
  trackingClient.GetVehicleStatus(
    { vehicleId: vehicleId },
    (error: any, response: any) => {
      if (error) {
        console.error("❌ Erro ao consultar status do veículo:", error);
        callback({
          code: grpc.status.NOT_FOUND,
          message: `Veículo ${vehicleId} não encontrado no sistema de rastreamento`,
        });
        return;
      }

      if (!response.isConnected || !response.lastPosition) {
        console.log(
          `⚠️ Veículo ${vehicleId} está offline ou sem posição conhecida`
        );
        callback({
          code: grpc.status.UNAVAILABLE,
          message: `Veículo ${vehicleId} está offline ou sem posição conhecida`,
        });
        return;
      }

      const currentLat = response.lastPosition.lat;
      const currentLon = response.lastPosition.lon;
      const currentVel = response.lastPosition.vel || 50; // velocidade padrão

      // Calcula distância
      const distance = calculateDistance(
        currentLat,
        currentLon,
        destinationLat,
        destinationLon
      );

      // Obtém condições de trânsito e clima (agora estáveis)
      const trafficCondition = getTrafficCondition(vehicleId);
      const weatherCondition = getWeatherCondition(vehicleId);

      // Calcula tempo base (sem condições adversas)
      const baseTimeHours = distance / currentVel;

      // Aplica fatores de correção
      const adjustedTimeHours =
        baseTimeHours * trafficCondition.factor * weatherCondition.factor;
      const etaMinutes = Math.round(adjustedTimeHours * 60);

      // Calcula horário de chegada
      const arrivalTime = new Date(Date.now() + etaMinutes * 60 * 1000);

      console.log(`📊 Cálculo ETA:`);
      console.log(`  📏 Distância: ${distance.toFixed(2)} km`);
      console.log(`  🚗 Velocidade atual: ${currentVel} km/h`);
      console.log(
        `  🚦 ${trafficCondition.description} (fator: ${trafficCondition.factor})`
      );
      console.log(
        `  🌤️  ${weatherCondition.description} (fator: ${weatherCondition.factor})`
      );
      console.log(`  ⏱️  ETA: ${etaMinutes} minutos`);
      console.log(
        `  🕐 Chegada prevista: ${arrivalTime.toLocaleString("pt-BR")}`
      );

      const etaResponse = {
        vehicleId: vehicleId,
        currentLat: currentLat,
        currentLon: currentLon,
        destinationLat: destinationLat,
        destinationLon: destinationLon,
        distanceKm: parseFloat(distance.toFixed(2)),
        currentSpeed: currentVel,
        estimatedMinutes: etaMinutes,
        arrivalTime: arrivalTime.toISOString(),
        trafficCondition: trafficCondition.description,
        weatherCondition: weatherCondition.description,
        calculatedAt: new Date().toISOString(),
      };

      callback(null, etaResponse);
    }
  );
}

function getMultipleETAs(
  call: grpc.ServerUnaryCall<any, any>,
  callback: grpc.sendUnaryData<any>
) {
  const request = call.request;
  const destinationLat = request.destinationLat;
  const destinationLon = request.destinationLon;

  console.log(`📍 Calculando ETA para todos os veículos`);
  console.log(`🎯 Destino: ${destinationLat}, ${destinationLon}`);

  // Lista todos os veículos da Central de Rastreamento
  trackingClient.ListVehicles({}, (error: any, response: any) => {
    if (error) {
      console.error("❌ Erro ao listar veículos:", error);
      callback({
        code: grpc.status.INTERNAL,
        message: "Erro ao consultar lista de veículos",
      });
      return;
    }

    const vehicles = response.vehicles || [];
    const etas: any[] = [];

    if (vehicles.length === 0) {
      console.log("📭 Nenhum veículo ativo encontrado");
      callback(null, { etas: [] });
      return;
    }

    // Calcula ETA para cada veículo
    vehicles.forEach((vehicle: any) => {
      if (vehicle.lastPosition) {
        const currentLat = vehicle.lastPosition.lat;
        const currentLon = vehicle.lastPosition.lon;
        const currentVel = vehicle.lastPosition.vel || 50;

        const distance = calculateDistance(
          currentLat,
          currentLon,
          destinationLat,
          destinationLon
        );
        const trafficCondition = getTrafficCondition(vehicle.vehicleId);
        const weatherCondition = getWeatherCondition(vehicle.vehicleId);

        const baseTimeHours = distance / currentVel;
        const adjustedTimeHours =
          baseTimeHours * trafficCondition.factor * weatherCondition.factor;
        const etaMinutes = Math.round(adjustedTimeHours * 60);
        const arrivalTime = new Date(Date.now() + etaMinutes * 60 * 1000);

        etas.push({
          vehicleId: vehicle.vehicleId,
          currentLat: currentLat,
          currentLon: currentLon,
          distanceKm: parseFloat(distance.toFixed(2)),
          currentSpeed: currentVel,
          estimatedMinutes: etaMinutes,
          arrivalTime: arrivalTime.toISOString(),
          trafficCondition: trafficCondition.description,
          weatherCondition: weatherCondition.description,
        });
      }
    });

    // Ordena por tempo de chegada
    etas.sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);

    console.log(`📊 ETAs calculados para ${etas.length} veículos`);

    callback(null, {
      destinationLat: destinationLat,
      destinationLon: destinationLon,
      etas: etas,
      calculatedAt: new Date().toISOString(),
    });
  });
}

function main() {
  const server = new grpc.Server();

  server.addService(etaProto.eta.ETAService.service, {
    CalculateETA: calculateETA,
    GetMultipleETAs: getMultipleETAs,
  });

  const port = "0.0.0.0:50052";
  server.bindAsync(
    port,
    grpc.ServerCredentials.createInsecure(),
    (error, port) => {
      if (error) {
        console.error("❌ Erro ao iniciar servidor ETA:", error);
        return;
      }

      console.log("⏰ Serviço de Estimativa de Entrega iniciado!");
      console.log(`🌐 Servidor rodando na porta: ${port}`);
      console.log("📊 Pronto para calcular ETAs...");
      console.log("=".repeat(50));
    }
  );
}

main();

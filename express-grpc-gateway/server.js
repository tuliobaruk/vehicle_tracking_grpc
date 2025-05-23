const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createServer } = require('http');

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

// Configuração do servidor Express
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Configuração do cliente gRPC
const TRACKING_PROTO_PATH = path.resolve(__dirname, '../protos/tracking.proto');
const ETA_PROTO_PATH = path.resolve(__dirname, '../protos/eta.proto');

const trackingPackageDef = protoLoader.loadSync(TRACKING_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const etaPackageDef = protoLoader.loadSync(ETA_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const trackingProto = grpc.loadPackageDefinition(trackingPackageDef);
const etaProto = grpc.loadPackageDefinition(etaPackageDef);

// Clientes gRPC
const trackingClient = new trackingProto.tracking.Tracker('localhost:50051', grpc.credentials.createInsecure());
const etaClient = new etaProto.eta.ETAService('localhost:50052', grpc.credentials.createInsecure());

// Armazenamento em memória dos veículos
const vehiclePositions = new Map();

// Conexão WebSocket para atualizações em tempo real
wss.on('connection', (ws) => {
  console.log('🔌 Cliente WebSocket conectado');

  // Envia posições atuais ao conectar
  const currentVehicles = Array.from(vehiclePositions.values());
  ws.send(JSON.stringify({
    type: 'vehicles',
    data: currentVehicles
  }));

  ws.on('close', () => {
    console.log('🔌 Cliente WebSocket desconectado');
  });

  ws.on('error', (error) => {
    console.error('❌ Erro no WebSocket:', error.message);
  });
});

// Função para broadcast das posições
function broadcastVehiclePositions() {
  const vehicles = Array.from(vehiclePositions.values());
  const message = JSON.stringify({
    type: 'vehicles',
    data: vehicles
  });

  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      try {
        client.send(message);
      } catch (error) {
        console.error('❌ Erro ao enviar mensagem WebSocket:', error.message);
      }
    }
  });
}

// Monitora veículos da Central de Rastreamento
function monitorVehicles() {
  setInterval(() => {
    trackingClient.ListVehicles({}, (error, response) => {
      if (error) {
        console.error('❌ Erro ao listar veículos:', error.message);
        return;
      }

      const vehicles = response.vehicles || [];
      let hasUpdates = false;

      vehicles.forEach((vehicle) => {
        if (vehicle.lastPosition) {
          const vehicleData = {
            vehicleId: vehicle.vehicleId,
            lat: vehicle.lastPosition.lat,
            lon: vehicle.lastPosition.lon,
            vel: vehicle.lastPosition.vel,
            timestamp: vehicle.lastPosition.timestamp,
            lastUpdate: Date.now()
          };

          // Verifica se houve mudança de posição
          const existing = vehiclePositions.get(vehicle.vehicleId);
          if (!existing ||
              existing.lat !== vehicleData.lat ||
              existing.lon !== vehicleData.lon ||
              existing.vel !== vehicleData.vel) {
            vehiclePositions.set(vehicle.vehicleId, vehicleData);
            hasUpdates = true;
          }
        }
      });

      // Remove veículos offline (sem atualização há mais de 30 segundos)
      const now = Date.now();
      vehiclePositions.forEach((vehicle, vehicleId) => {
        if (now - vehicle.lastUpdate > 30000) {
          vehiclePositions.delete(vehicleId);
          hasUpdates = true;
        }
      });

      // Broadcast se houve atualizações
      if (hasUpdates) {
        broadcastVehiclePositions();
      }
    });
  }, 2000); // Atualiza a cada 2 segundos
}

// Rotas da API

// GET /api/vehicles - Lista todos os veículos
app.get('/api/vehicles', (req, res) => {
  const vehicles = Array.from(vehiclePositions.values());
  res.json({
    success: true,
    data: vehicles,
    count: vehicles.length
  });
});

// GET /api/vehicles/:id - Obter veículo específico
app.get('/api/vehicles/:id', (req, res) => {
  const vehicleId = req.params.id;
  const vehicle = vehiclePositions.get(vehicleId);

  if (!vehicle) {
    return res.status(404).json({
      success: false,
      message: `Veículo ${vehicleId} não encontrado`
    });
  }

  res.json({
    success: true,
    data: vehicle
  });
});

// POST /api/eta - Calcular ETA para um veículo
app.post('/api/eta', (req, res) => {
  const { vehicleId, destinationLat, destinationLon } = req.body;

  if (!vehicleId || !destinationLat || !destinationLon) {
    return res.status(400).json({
      success: false,
      message: 'Parâmetros obrigatórios: vehicleId, destinationLat, destinationLon'
    });
  }

  const request = {
    vehicleId,
    destinationLat,
    destinationLon
  };

  etaClient.CalculateETA(request, (error, response) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.json({
      success: true,
      data: response
    });
  });
});

// POST /api/eta/all - Calcular ETA para todos os veículos
app.post('/api/eta/all', (req, res) => {
  const { destinationLat, destinationLon } = req.body;

  if (!destinationLat || !destinationLon) {
    return res.status(400).json({
      success: false,
      message: 'Parâmetros obrigatórios: destinationLat, destinationLon'
    });
  }

  const request = {
    destinationLat,
    destinationLon
  };

  etaClient.GetMultipleETAs(request, (error, response) => {
    if (error) {
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }

    res.json({
      success: true,
      data: response
    });
  });
});

// GET /api/status - Status da aplicação
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    connectedVehicles: vehiclePositions.size,
    websocketClients: wss.clients.size,
    timestamp: new Date().toISOString()
  });
});

// Rota de teste
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API Gateway funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Middleware de erro
app.use((err, req, res, next) => {
  console.error('❌ Erro na API:', err);
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor'
  });
});

// Iniciar servidor
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log('🌐 Express gRPC Gateway iniciado!');
  console.log(`📡 Servidor HTTP rodando na porta: ${PORT}`);
  console.log(`🔌 WebSocket servidor iniciado na porta: ${PORT}`);
  console.log('🔗 Endpoints disponíveis:');
  console.log(`   GET  http://localhost:${PORT}/api/vehicles`);
  console.log(`   GET  http://localhost:${PORT}/api/vehicles/:id`);
  console.log(`   POST http://localhost:${PORT}/api/eta`);
  console.log(`   POST http://localhost:${PORT}/api/eta/all`);
  console.log(`   GET  http://localhost:${PORT}/api/status`);
  console.log(`   WS   ws://localhost:${PORT}`);
  console.log('='.repeat(50));

  // Inicia o monitoramento de veículos
  monitorVehicles();
});

module.exports = app;
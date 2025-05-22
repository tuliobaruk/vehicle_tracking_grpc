import { useEffect, useState, useCallback, useRef } from "react";
import type { Vehicle } from "../types";

interface VehicleData {
  vehicleId: string;
  lat: number;
  lon: number;
  vel: number;
  timestamp: number;
  lastUpdate: number;
}

interface WebSocketMessage {
  type: "vehicles" | "error" | "status";
  data: VehicleData[] | string;
}

export const useVehicles = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Função para converter dados do gRPC para o formato do frontend
  const convertVehicleData = useCallback(
    (vehicleData: VehicleData): Vehicle => ({
      id: vehicleData.vehicleId,
      lat: vehicleData.lat,
      lon: vehicleData.lon,
      speed: vehicleData.vel,
      timestamp: vehicleData.timestamp,
      lastUpdate: vehicleData.lastUpdate,
    }),
    []
  );

  // Função para conectar ao WebSocket
  const connectWebSocket = useCallback(() => {
    // Se já está conectado, não tenta reconectar
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket("ws://localhost:3001");
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("🔌 Conectado ao WebSocket do Gateway");
        setIsConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          if (message.type === "vehicles" && Array.isArray(message.data)) {
            const vehicleList = message.data.map(convertVehicleData);
            setVehicles(vehicleList);
          } else if (message.type === "error") {
            console.error("❌ Erro do WebSocket:", message.data);
            setError(message.data as string);
          }
        } catch (err) {
          console.error("❌ Erro ao processar mensagem WebSocket:", err);
        }
      };

      ws.onclose = (event) => {
        console.log("🔌 WebSocket desconectado:", event.code, event.reason);
        setIsConnected(false);

        // Tenta reconectar se não foi um fechamento intencional
        if (
          event.code !== 1000 &&
          reconnectAttempts.current < maxReconnectAttempts
        ) {
          const delay = Math.min(
            1000 * Math.pow(2, reconnectAttempts.current),
            30000
          );
          console.log(
            `🔄 Tentando reconectar em ${delay}ms... (tentativa ${
              reconnectAttempts.current + 1
            }/${maxReconnectAttempts})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connectWebSocket();
          }, delay);
        } else if (reconnectAttempts.current >= maxReconnectAttempts) {
          setError(
            "Não foi possível conectar ao servidor após várias tentativas"
          );
        }
      };

      ws.onerror = (error) => {
        console.error("❌ Erro no WebSocket:", error);
        setError("Erro de conexão com o servidor");
      };
    } catch (err) {
      console.error("❌ Erro ao criar WebSocket:", err);
      setError("Não foi possível conectar ao servidor");
    }
  }, [convertVehicleData]);

  // Função para buscar veículos via HTTP (fallback)
  const fetchVehicles = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3001/api/vehicles");
      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        const vehicleList = result.data.map(convertVehicleData);
        setVehicles(vehicleList);
        setError(null);
      } else {
        throw new Error(result.message || "Erro ao buscar veículos");
      }
    } catch (err) {
      console.error("❌ Erro ao buscar veículos:", err);
      setError("Erro ao buscar dados dos veículos");
    }
  }, [convertVehicleData]);

  // Função para calcular ETA
  const calculateETA = useCallback(
    async (
      vehicleId: string,
      destinationLat: number,
      destinationLon: number
    ) => {
      try {
        const response = await fetch("http://localhost:3001/api/eta", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vehicleId,
            destinationLat,
            destinationLon,
          }),
        });

        const result = await response.json();

        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.message || "Erro ao calcular ETA");
        }
      } catch (err) {
        console.error("❌ Erro ao calcular ETA:", err);
        throw err;
      }
    },
    []
  );

  // Função para calcular ETA de todos os veículos
  const calculateAllETAs = useCallback(
    async (destinationLat: number, destinationLon: number) => {
      try {
        const response = await fetch("http://localhost:3001/api/eta/all", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            destinationLat,
            destinationLon,
          }),
        });

        const result = await response.json();

        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.message || "Erro ao calcular ETAs");
        }
      } catch (err) {
        console.error("❌ Erro ao calcular ETAs:", err);
        throw err;
      }
    },
    []
  );

  // Função para verificar status da conexão
  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch("http://localhost:3001/api/status");
      const result = await response.json();
      return result;
    } catch (err) {
      console.error("❌ Erro ao verificar status:", err);
      return null;
    }
  }, []);

  // Effect para conectar ao WebSocket
  useEffect(() => {
    connectWebSocket();

    // Cleanup
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounting");
      }
    };
  }, [connectWebSocket]);

  // Fallback: se WebSocket não conectar, usa polling HTTP
  useEffect(() => {
    let pollInterval: number;

    if (!isConnected) {
      // Se não conectado via WebSocket, faz polling a cada 3 segundos
      pollInterval = setInterval(fetchVehicles, 3000);
      // Busca imediatamente
      fetchVehicles();
    }

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [isConnected, fetchVehicles]);

  return {
    vehicles,
    isConnected,
    error,
    calculateETA,
    calculateAllETAs,
    checkStatus,
    reconnect: connectWebSocket,
  };
};

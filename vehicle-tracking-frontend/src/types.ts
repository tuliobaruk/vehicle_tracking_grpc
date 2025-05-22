export interface Vehicle {
  id: string;
  lat: number;
  lon: number;
  speed?: number;
  timestamp?: number;
  lastUpdate?: number;
}

export interface ETAResponse {
  vehicleId: string;
  currentLat: number;
  currentLon: number;
  destinationLat: number;
  destinationLon: number;
  distanceKm: number;
  currentSpeed: number;
  estimatedMinutes: number;
  arrivalTime: string;
  trafficCondition: string;
  weatherCondition: string;
  confidence: number;
  calculatedAt: string;
}

export interface MultipleETAResponse {
  destinationLat: number;
  destinationLon: number;
  etas: ETAResponse[];
  calculatedAt: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  count?: number;
}

export interface ConnectionStatus {
  success: boolean;
  status: string;
  connectedVehicles: number;
  websocketClients: number;
  timestamp: string;
}
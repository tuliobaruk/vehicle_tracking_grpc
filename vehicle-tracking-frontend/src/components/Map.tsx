import { useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { type LatLngExpression } from 'leaflet';
import type { Vehicle, ETAResponse } from '../types';
import 'leaflet/dist/leaflet.css';
import carIcon from "../assets/car.png"
import * as L from 'leaflet';

const vehicleIcon = new L.Icon({
  iconUrl: carIcon,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -20],
});

const destinationIcon = new L.Icon({
  iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMSAyTDE0IDlMMjEgMTRMMTMuMDkgMTUuNzRMMTIgMjJMMTAuOTEgMTUuNzRMMyAxNEwxMCA5TDMgMkwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjRkY0NDQ0Ii8+Cjwvc3ZnPgo=',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  popupAnchor: [0, -15],
});

interface MapProps {
  vehicles: Vehicle[];
  calculateETA: (vehicleId: string, lat: number, lon: number) => Promise<ETAResponse>;
  calculateAllETAs: (lat: number, lon: number) => Promise<{ etas: ETAResponse[]; calculatedAt: string }>;
  isConnected: boolean;
}

interface MapEventsProps {
  onMapClick: (lat: number, lon: number) => void;
}

const MapEvents = ({ onMapClick }: MapEventsProps) => {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export const Map = ({ vehicles, calculateETA, calculateAllETAs }: MapProps) => {
  const [destination, setDestination] = useState<{ lat: number; lon: number } | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [etaData, setEtaData] = useState<ETAResponse | null>(null);
  const [allETAs, setAllETAs] = useState<{ etas: ETAResponse[]; calculatedAt: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const center: LatLngExpression = [-8.1139, -35.0228];

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setDestination({ lat, lon });
    setEtaData(null);
    setAllETAs(null);
    console.log(`📍 Destino selecionado: ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  }, []);

  const handleCalculateETA = useCallback(async (vehicleId: string) => {
    if (!destination) {
      alert('Clique no mapa para selecionar um destino primeiro');
      return;
    }

    setLoading(true);
    setSelectedVehicle(vehicleId);

    try {
      const eta = await calculateETA(vehicleId, destination.lat, destination.lon);
      setEtaData(eta);
      setAllETAs(null); // Limpa ETAs de todos os veículos
      console.log('📊 ETA calculado:', eta);
    } catch (error) {
      console.error('❌ Erro ao calcular ETA:', error);
      alert('Erro ao calcular ETA. Verifique se os serviços estão rodando.');
    } finally {
      setLoading(false);
    }
  }, [destination, calculateETA]);

  const handleCalculateAllETAs = useCallback(async () => {
    if (!destination) {
      alert('Clique no mapa para selecionar um destino primeiro');
      return;
    }

    setLoading(true);
    setSelectedVehicle(null);

    try {
      const etas = await calculateAllETAs(destination.lat, destination.lon);
      setAllETAs(etas);
      setEtaData(null); // Limpa ETA individual
      console.log('📊 ETAs calculados:', etas);
    } catch (error) {
      console.error('❌ Erro ao calcular ETAs:', error);
      alert('Erro ao calcular ETAs. Verifique se os serviços estão rodando.');
    } finally {
      setLoading(false);
    }
  }, [destination, calculateAllETAs]);

  const formatTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  const formatArrivalTime = (isoString: string): string => {
    return new Date(isoString).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%' }}>

      {/* Painel de Controle */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1000,
        background: 'white',
        padding: '16px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        minWidth: '250px',
        maxWidth: '400px',
        maxHeight: '80vh',
        overflow: 'auto'
      }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '16px' }}>
          🎯 Controle de ETA
        </h3>

        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#666' }}>
          Clique no mapa para selecionar destino
        </p>

        {destination && (
          <div style={{ marginBottom: '12px', padding: '8px', background: '#f5f5f5', borderRadius: '4px' }}>
            <strong>📍 Destino:</strong><br />
            <code style={{ fontSize: '11px' }}>
              {destination.lat.toFixed(6)}, {destination.lon.toFixed(6)}
            </code>
          </div>
        )}

        {destination && (
          <button
            onClick={handleCalculateAllETAs}
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px',
              marginBottom: '12px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '12px'
            }}
          >
            {loading ? '⏳ Calculando...' : '📊 ETA Todos os Veículos'}
          </button>
        )}

        <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
          <strong>🚗 Veículos ({vehicles.length}):</strong>
        </div>

        {vehicles.map((vehicle) => (
          <div key={vehicle.id} style={{
            padding: '8px',
            margin: '4px 0',
            background: selectedVehicle === vehicle.id ? '#e3f2fd' : '#f9f9f9',
            borderRadius: '4px',
            border: selectedVehicle === vehicle.id ? '2px solid #2196F3' : '1px solid #ddd'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{vehicle.id}</strong><br />
                <span style={{ fontSize: '10px', color: '#666' }}>
                  {vehicle.speed ? `${vehicle.speed} km/h` : 'Parado'}
                </span>
              </div>
              {destination && (
                <button
                  onClick={() => handleCalculateETA(vehicle.id)}
                  disabled={loading}
                  style={{
                    padding: '4px 8px',
                    fontSize: '10px',
                    backgroundColor: '#4CAF50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: loading ? 'not-allowed' : 'pointer'
                  }}
                >
                  ETA
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Exibir ETA Individual */}
        {etaData && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: '#e8f5e8',
            borderRadius: '6px',
            border: '1px solid #4CAF50'
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#2E7D32', fontSize: '14px' }}>
              🚗 ETA: {etaData.vehicleId}
            </h4>
            <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
              <div><strong>📏 Distância:</strong> {etaData.distanceKm} km</div>
              <div><strong>🏃 Velocidade:</strong> {etaData.currentSpeed} km/h</div>
              <div><strong>⏱️  Tempo:</strong> {formatTime(etaData.estimatedMinutes)}</div>
              <div><strong>🕐 Chegada:</strong> {formatArrivalTime(etaData.arrivalTime)}</div>
              <div><strong>🚦 Trânsito:</strong> {etaData.trafficCondition}</div>
              <div><strong>🌤️  Clima:</strong> {etaData.weatherCondition}</div>
              <div><strong>📊 Confiança:</strong> {(etaData.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>
        )}

        {/* Exibir ETAs de Todos os Veículos */}
        {allETAs && allETAs.etas && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: '#fff3e0',
            borderRadius: '6px',
            border: '1px solid #FF9800'
          }}>
            <h4 style={{ margin: '0 0 8px 0', color: '#E65100', fontSize: '14px' }}>
              🏆 Ranking de Chegada ({allETAs.etas.length} veículos)
            </h4>
            {allETAs.etas.slice(0, 5).map((eta: ETAResponse, index: number) => (
              <div key={eta.vehicleId} style={{
                padding: '6px',
                margin: '4px 0',
                background: index === 0 ? '#4CAF50' : '#f5f5f5',
                color: index === 0 ? 'white' : 'black',
                borderRadius: '4px',
                fontSize: '11px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span><strong>{index + 1}º {eta.vehicleId}</strong></span>
                  <span>{formatTime(eta.estimatedMinutes)}</span>
                </div>
                <div style={{ fontSize: '10px', opacity: 0.8 }}>
                  {eta.distanceKm} km • {eta.currentSpeed} km/h
                </div>
              </div>
            ))}

            {allETAs.etas.length > 5 && (
              <div style={{ fontSize: '10px', color: '#666', textAlign: 'center', marginTop: '8px' }}>
                ... e mais {allETAs.etas.length - 5} veículo(s)
              </div>
            )}

            <div style={{ marginTop: '8px', fontSize: '10px', color: '#666' }}>
              📊 Calculado em: {formatArrivalTime(allETAs.calculatedAt)}
            </div>
          </div>
        )}

        {loading && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            background: '#f0f0f0',
            borderRadius: '6px',
            textAlign: 'center',
            fontSize: '12px'
          }}>
            ⏳ Calculando ETA...
          </div>
        )}

        <div style={{ marginTop: '16px', fontSize: '10px', color: '#999' }}>
          💡 Dica: Clique no mapa para definir destino, depois clique em um veículo no mapa para ETA individual
        </div>
      </div>

      {/* Mapa */}
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapEvents onMapClick={handleMapClick} />

        {/* Marcadores dos Veículos */}
        {vehicles.map((vehicle) => (
          <Marker
            key={vehicle.id}
            position={[vehicle.lat, vehicle.lon]}
            icon={vehicleIcon}
          >
            <Popup>
              <div style={{ minWidth: '200px' }}>
                <h4 style={{ margin: '0 0 8px 0' }}>🚗 {vehicle.id}</h4>
                <div style={{ fontSize: '12px', lineHeight: '1.4' }}>
                  <div><strong>📍 Posição:</strong></div>
                  <div style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                    {vehicle.lat.toFixed(6)}, {vehicle.lon.toFixed(6)}
                  </div>
                  {vehicle.speed && (
                    <div><strong>🏃 Velocidade:</strong> {vehicle.speed} km/h</div>
                  )}
                  {vehicle.lastUpdate && (
                    <div><strong>🕐 Última atualização:</strong></div>
                  )}
                  <div style={{ fontSize: '10px', color: '#666' }}>
                    {vehicle.lastUpdate ? new Date(vehicle.lastUpdate).toLocaleTimeString('pt-BR') : 'N/A'}
                  </div>
                </div>

                {destination && (
                  <button
                    onClick={() => handleCalculateETA(vehicle.id)}
                    disabled={loading}
                    style={{
                      marginTop: '8px',
                      padding: '6px 12px',
                      backgroundColor: '#4CAF50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '11px',
                      width: '100%'
                    }}
                  >
                    {loading && selectedVehicle === vehicle.id ? '⏳ Calculando...' : '📊 Calcular ETA'}
                  </button>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Marcador do Destino */}
        {destination && (
          <Marker position={[destination.lat, destination.lon]} icon={destinationIcon}>
            <Popup>
              <div>
                <h4 style={{ margin: '0 0 8px 0' }}>🎯 Destino</h4>
                <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                  {destination.lat.toFixed(6)}, {destination.lon.toFixed(6)}
                </div>
                <button
                  onClick={() => setDestination(null)}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  ❌ Remover Destino
                </button>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
};
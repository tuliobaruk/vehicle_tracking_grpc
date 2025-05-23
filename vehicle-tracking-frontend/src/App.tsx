import { useState, useEffect } from 'react';
import { Map } from './components/Map';
import { useVehicles } from './hooks/useVehicles';
import './App.css';

function App() {
  const {
    vehicles,
    isConnected,
    error,
    calculateETA,
    calculateAllETAs,
    checkStatus,
    reconnect
  } = useVehicles();

  const [showStatus, setShowStatus] = useState(false);
  type ServerStatus = {
    status?: string;
    websocketClients?: number;
    timestamp?: string | number;
    [key: string]: unknown;
  };
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    const checkServerStatus = async () => {
      const status = await checkStatus();
      setServerStatus(status);
    };

    checkServerStatus();
    const interval = setInterval(checkServerStatus, 30000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleReconnect = () => reconnect();
  const toggleStatus = () => setShowStatus(!showStatus);

  return (
    <div className="App">
      {/* Header */}
      <header className="app-header">
        <div>
          <h1 className="header-title">Sistema de Rastreamento de Veículos</h1>
          <div className="header-subtitle">
            {vehicles.length} veículo{vehicles.length !== 1 ? 's' : ''} conectado{vehicles.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="status-group">
          <div className="status-indicator">
            <div className={`status-light ${isConnected ? 'status-online' : 'status-offline'}`} />
            {isConnected ? 'Online' : 'Offline'}
          </div>

          <button onClick={toggleStatus} className="btn-status">📊 Status</button>

          {!isConnected && (
            <button onClick={handleReconnect} className="btn-reconnect">🔄 Reconectar</button>
          )}
        </div>
      </header>

      {/* Painel de Status */}
      {showStatus && (
        <div className="status-panel">
          <div className="panel-header">
            <h3>📊 Status do Sistema</h3>
            <button onClick={toggleStatus} className="btn-close">❌</button>
          </div>

          <div className="panel-body">
            <div className="status-item"><strong>🔌 WebSocket:</strong> {isConnected ? '✅ Conectado' : '❌ Desconectado'}</div>
            <div className="status-item"><strong>🚗 Veículos:</strong> {vehicles.length} ativo{vehicles.length !== 1 ? 's' : ''}</div>

            {serverStatus && (
              <>
                <div className="status-item"><strong>🌐 Servidor:</strong> {serverStatus.status || 'N/A'}</div>
                <div className="status-item"><strong>👥 Clientes WS:</strong> {serverStatus.websocketClients || 0}</div>
                <div className="status-item"><strong>🕐 Último status:</strong> {serverStatus.timestamp ? new Date(serverStatus.timestamp).toLocaleTimeString('pt-BR') : 'N/A'}</div>
              </>
            )}

            {error && (
              <div className="error-box">
                <strong>❌ Erro:</strong> {error}
              </div>
            )}

            {vehicles.length > 0 && (
              <div className="vehicle-list">
                <strong>🚗 Veículos Ativos:</strong>
                <div style={{ marginTop: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                  {vehicles.map((vehicle) => (
                    <div key={vehicle.id} className="vehicle-item">
                      <div className="vehicle-item-header">
                        <span><strong>{vehicle.id}</strong></span>
                        <span>{vehicle.speed ? `${vehicle.speed} km/h` : '0 km/h'}</span>
                      </div>
                      <div className="vehicle-item-sub">
                        {vehicle.lastUpdate
                          ? `Atualizado: ${new Date(vehicle.lastUpdate).toLocaleTimeString('pt-BR')}`
                          : 'Sem dados de tempo'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mapa */}
      <div className="map-container">
        <Map
          vehicles={vehicles}
          calculateETA={calculateETA}
          calculateAllETAs={calculateAllETAs}
          isConnected={isConnected}
        />
      </div>

      {/* Erro */}
      {error && !showStatus && (
        <div className="error-notification">
          <strong>❌ Erro de Conexão:</strong><br />
          {error}
          <button onClick={handleReconnect} className="btn-retry">
            🔄 Tentar Novamente
          </button>
        </div>
      )}
    </div>
  );
}

export default App;

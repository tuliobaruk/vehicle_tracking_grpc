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

  // Verifica status do servidor periodicamente
  useEffect(() => {
    const checkServerStatus = async () => {
      const status = await checkStatus();
      setServerStatus(status);
    };

    checkServerStatus();
    const interval = setInterval(checkServerStatus, 30000); // A cada 30 segundos

    return () => clearInterval(interval);
  }, [checkStatus]);

  const handleReconnect = () => {
    reconnect();
  };

  const toggleStatus = () => {
    setShowStatus(!showStatus);
  };

  return (
    <div className="App">
      {/* Header */}
      <header style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1001,
        background: 'linear-gradient(90deg, #1976d2, #2196f3)',
        color: 'white',
        padding: '8px 16px',
        display: 'flex',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>
            Sistema de Rastreamento de Veículos
          </h1>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>
            {vehicles.length} veículo{vehicles.length !== 1 ? 's' : ''} conectado{vehicles.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Indicador de Status */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px'
          }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isConnected ? '#4CAF50' : '#F44336'
            }} />
            {isConnected ? 'Online' : 'Offline'}
          </div>

          {/* Botão de Status */}
          <button
            onClick={toggleStatus}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            📊 Status
          </button>

          {/* Botão de Reconectar */}
          {!isConnected && (
            <button
              onClick={handleReconnect}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              🔄 Reconectar
            </button>
          )}
        </div>
      </header>

      {/* Painel de Status */}
      {showStatus && (
        <div style={{
          position: 'absolute',
          top: '60px',
          right: '16px',
          zIndex: 1002,
          background: 'white',
          padding: '16px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          minWidth: '300px',
          maxWidth: '400px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '16px' }}>📊 Status do Sistema</h3>
            <button
              onClick={toggleStatus}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '16px',
                cursor: 'pointer'
              }}
            >
              ❌
            </button>
          </div>

          <div style={{ fontSize: '12px', lineHeight: '1.6' }}>
            <div style={{ marginBottom: '8px' }}>
              <strong>🔌 WebSocket:</strong> {isConnected ? '✅ Conectado' : '❌ Desconectado'}
            </div>

            <div style={{ marginBottom: '8px' }}>
              <strong>🚗 Veículos:</strong> {vehicles.length} ativo{vehicles.length !== 1 ? 's' : ''}
            </div>

            {serverStatus && (
              <>
                <div style={{ marginBottom: '8px' }}>
                  <strong>🌐 Servidor:</strong> {serverStatus.status || 'N/A'}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>👥 Clientes WS:</strong> {serverStatus.websocketClients || 0}
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <strong>🕐 Último status:</strong> {serverStatus.timestamp ? new Date(serverStatus.timestamp).toLocaleTimeString('pt-BR') : 'N/A'}
                </div>
              </>
            )}

            {error && (
              <div style={{
                marginTop: '12px',
                padding: '8px',
                backgroundColor: '#ffebee',
                borderRadius: '4px',
                color: '#c62828',
                fontSize: '11px'
              }}>
                <strong>❌ Erro:</strong> {error}
              </div>
            )}

            {/* Lista de Veículos */}
            {vehicles.length > 0 && (
              <div style={{ marginTop: '12px' }}>
                <strong>🚗 Veículos Ativos:</strong>
                <div style={{ marginTop: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                  {vehicles.map((vehicle) => (
                    <div key={vehicle.id} style={{
                      padding: '4px 8px',
                      margin: '2px 0',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      fontSize: '11px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span><strong>{vehicle.id}</strong></span>
                        <span>{vehicle.speed ? `${vehicle.speed} km/h` : '0 km/h'}</span>
                      </div>
                      <div style={{ color: '#666', fontSize: '10px' }}>
                        {vehicle.lastUpdate ?
                          `Atualizado: ${new Date(vehicle.lastUpdate).toLocaleTimeString('pt-BR')}` :
                          'Sem dados de tempo'
                        }
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mapa Principal */}
      <div style={{ paddingTop: '45px', height: '100vh' }}>
        <Map
          vehicles={vehicles}
          calculateETA={calculateETA}
          calculateAllETAs={calculateAllETAs}
          isConnected={isConnected}
        />
      </div>

      {/* Notificação de Erro */}
      {error && !showStatus && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '45px',
          zIndex: 1001,
          background: '#f44336',
          color: 'white',
          padding: '12px 16px',
          borderRadius: '4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          maxWidth: '300px',
          fontSize: '12px'
        }}>
          <strong>❌ Erro de Conexão:</strong><br />
          {error}
          <button
            onClick={handleReconnect}
            style={{
              marginTop: '8px',
              padding: '4px 8px',
              backgroundColor: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '11px'
            }}
          >
            🔄 Tentar Novamente
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
import { Map } from './components/Map';
import { useVehicles } from './hooks/useVehicles';

function App() {
  const vehicles = useVehicles();

  return <Map vehicles={vehicles} />;
}

export default App;

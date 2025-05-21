import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { type LatLngExpression } from 'leaflet';
import type { Vehicle } from '../types';
import 'leaflet/dist/leaflet.css';
import carIcon from "../assets/car.png"

import * as L from 'leaflet';

const vehicleIcon = new L.Icon({
  iconUrl: carIcon,
  iconSize: [40, 40],
});

interface MapProps {
  vehicles: Vehicle[];
}

export const Map = ({ vehicles }: MapProps) => {
  const center: LatLngExpression = [-8.1139, -35.0228];

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100vh', width: '100%' }}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {vehicles.map((v) => (
        <Marker key={v.id} position={[v.lat, v.lon]} icon={vehicleIcon}>
          <Popup>{v.id}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
};

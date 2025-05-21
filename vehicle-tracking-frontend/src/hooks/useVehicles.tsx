import { useEffect, useState } from 'react';
import type { Vehicle } from '../types';

export const useVehicles = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const gpxPoints = [
    { lat: -8.11382, lon: -35.030983 },
    { lat: -8.11338, lon: -35.030822 },
    { lat: -8.113186, lon: -35.030792 },
    { lat: -8.112972, lon: -35.030775 },
    { lat: -8.112968, lon: -35.030199 },
    { lat: -8.112941, lon: -35.029089 },
    { lat: -8.112941, lon: -35.028875 },
    { lat: -8.112958, lon: -35.028693 },
    { lat: -8.112992, lon: -35.028522 },
    { lat: -8.113032, lon: -35.02838 },
    { lat: -8.113118, lon: -35.028158 },
    { lat: -8.113188, lon: -35.027997 },
    { lat: -8.113448, lon: -35.027455 },
    { lat: -8.113487, lon: -35.027376 },
    { lat: -8.113565, lon: -35.027217 },
    { lat: -8.113612, lon: -35.027098 },
    { lat: -8.113673, lon: -35.026912 },
    { lat: -8.113712, lon: -35.026756 },
    { lat: -8.113746, lon: -35.026588 },
    { lat: -8.113892, lon: -35.024773 },
    { lat: -8.113992, lon: -35.023516 }
  ];

  useEffect(() => {
    let index = 0;

    const interval = setInterval(() => {
      if (index < gpxPoints.length) {
        const point = gpxPoints[index];
        setVehicles([{ id: 'carro-01', lat: point.lat, lon: point.lon }]);
        index++;
      } else {
        index = 0;
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return vehicles;
};

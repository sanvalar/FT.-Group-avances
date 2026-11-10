import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import { money } from '../utils/format'

// Marcador naranja propio (no depende de imágenes externas).
const pin = L.divIcon({ className: 'map-pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] })

export default function MapView({ grupos }) {
  const puntos = grupos.filter(g => g.lat != null && g.lng != null)
  if (!puntos.length) return <p className="muted">Asigna una ciudad a tus grupos para verlos en el mapa.</p>
  const bounds = L.latLngBounds(puntos.map(g => [g.lat, g.lng])).pad(0.3)
  return (
    <div className="map">
      <MapContainer bounds={bounds} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {puntos.map(g => (
          <Marker key={g.id} position={[g.lat, g.lng]} icon={pin}>
            <Popup>
              <strong>{g.nombre}</strong><br />
              {g.ciudad} · {g.miembros.length} miembros<br />
              Total: {money(g.total_gastos)}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

export const CIUDADES = [
  { nombre: 'Medellín', lat: 6.2442, lng: -75.5812 },
  { nombre: 'Bogotá', lat: 4.711, lng: -74.0721 },
  { nombre: 'Cali', lat: 3.4516, lng: -76.532 },
  { nombre: 'Barranquilla', lat: 10.9685, lng: -74.7813 },
  { nombre: 'Cartagena', lat: 10.391, lng: -75.4794 },
  { nombre: 'Bucaramanga', lat: 7.1193, lng: -73.1227 },
  { nombre: 'Pereira', lat: 4.8133, lng: -75.6961 },
  { nombre: 'Santa Marta', lat: 11.2408, lng: -74.199 },
  { nombre: 'Manizales', lat: 5.0703, lng: -75.5138 },
  { nombre: 'Envigado', lat: 6.1706, lng: -75.5856 },
  { nombre: 'Bello', lat: 6.3373, lng: -75.5579 },
]

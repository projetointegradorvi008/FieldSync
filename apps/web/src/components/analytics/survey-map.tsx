'use client';

import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

// Ícone padrão do Leaflet quebra com bundlers (o caminho relativo dos PNGs
// não sobrevive ao build) — apontar direto para os assets publicados no
// unpkg é o contorno padrão da comunidade react-leaflet para esse problema.
const defaultIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface LocationPoint {
  responseId: string;
  latitude: number;
  longitude: number;
  collectedAt: string;
  researcher: { id: string; name: string } | null;
  status: string;
  // Presente só no mapa consolidado do Painel (todas as pesquisas) — no mapa
  // de uma pesquisa específica (Analytics) o título já está no cabeçalho.
  survey?: { id: string; title: string };
}

export function SurveyMap({ points }: { points: LocationPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-muted-foreground">
        Nenhum ponto coletado para os filtros atuais.
      </div>
    );
  }

  const center: [number, number] = [points[0].latitude, points[0].longitude];

  return (
    <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: '24rem', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarkerClusterGroup chunkedLoading>
        {points.map((point) => (
          <Marker key={point.responseId} position={[point.latitude, point.longitude]} icon={defaultIcon}>
            <Popup>
              <div className="flex flex-col gap-1 text-xs">
                {point.survey && (
                  <span>
                    <strong>Pesquisa:</strong> {point.survey.title}
                  </span>
                )}
                <span>
                  <strong>Pesquisador:</strong> {point.researcher?.name ?? 'Removido'}
                </span>
                <span>
                  <strong>Coletado em:</strong> {new Date(point.collectedAt).toLocaleString('pt-BR')}
                </span>
                <span>
                  <strong>Status:</strong> {point.status}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";

const regions = [
  { name: "Lyon", lat: 45.764, lng: 4.8357, count: 34, color: "hsl(43, 85%, 55%)" },
  { name: "Geneva", lat: 46.2044, lng: 6.1432, count: 21, color: "hsl(210, 80%, 55%)" },
  { name: "Paris", lat: 48.8566, lng: 2.3522, count: 48, color: "hsl(152, 60%, 45%)" },
  { name: "Marseille", lat: 43.2965, lng: 5.3698, count: 18, color: "hsl(43, 85%, 55%)" },
  { name: "Grenoble", lat: 45.1885, lng: 5.7245, count: 12, color: "hsl(280, 60%, 55%)" },
];

export function ActiveMap() {
  return (
    <div className="glass-panel rounded-xl p-5 animate-fade-in overflow-hidden">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-foreground">Active Regions</h3>
        <p className="text-xs text-muted-foreground">Live technician distribution</p>
      </div>
      <div className="h-[280px] rounded-lg overflow-hidden">
        <MapContainer
          center={[46.2, 4.5]}
          zoom={6}
          className="h-full w-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          {regions.map((r) => (
            <CircleMarker
              key={r.name}
              center={[r.lat, r.lng]}
              radius={Math.max(8, r.count / 3)}
              pathOptions={{
                fillColor: r.color,
                fillOpacity: 0.6,
                stroke: true,
                color: r.color,
                weight: 1,
              }}
            >
              <Popup>
                <div className="text-xs font-medium">
                  <strong>{r.name}</strong>
                  <br />
                  {r.count} active services
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

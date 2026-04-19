"use client";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";

const markerIcon = new L.Icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});

function ClickHandler({ onPick }) {
    useMapEvents({
        click(event) {
            const { lat, lng } = event.latlng;
            onPick(lat, lng);
        },
    });
    return null;
}

export function LocationPickerMap({ lat, lng, onPick }) {
    const center = [
        Number.isFinite(lat) ? lat : 15.9129,
        Number.isFinite(lng) ? lng : 79.74,
    ];

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200">
            <MapContainer
                center={center}
                zoom={Number.isFinite(lat) && Number.isFinite(lng) ? 15 : 6}
                style={{ height: "280px", width: "100%" }}
                scrollWheelZoom
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <ClickHandler onPick={onPick} />
                {Number.isFinite(lat) && Number.isFinite(lng) && (
                    <Marker position={[lat, lng]} icon={markerIcon} />
                )}
            </MapContainer>
        </div>
    );
}

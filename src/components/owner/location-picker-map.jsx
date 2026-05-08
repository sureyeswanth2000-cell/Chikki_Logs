"use client";
import { useEffect, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
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

function RecenterMap({ lat, lng }) {
    const map = useMap();

    useEffect(() => {
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            map.setView([lat, lng], Math.max(map.getZoom(), 15), { animate: true });
        }
    }, [lat, lng, map]);

    return null;
}

export function LocationPickerMap({ lat, lng, onPick }) {
    const [tileStatus, setTileStatus] = useState("loading");
    const center = [
        Number.isFinite(lat) ? lat : 15.9129,
        Number.isFinite(lng) ? lng : 79.74,
    ];
    const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

    return (
        <div className="relative overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-inner">
            <MapContainer
                center={center}
                zoom={hasPoint ? 15 : 6}
                style={{ height: "360px", width: "100%" }}
                scrollWheelZoom
                className="z-0"
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    eventHandlers={{
                        loading: () => setTileStatus("loading"),
                        load: () => setTileStatus("ready"),
                        tileerror: () => setTileStatus("error"),
                    }}
                />
                <ClickHandler onPick={onPick} />
                <RecenterMap lat={lat} lng={lng} />
                {hasPoint && (
                    <Marker position={[lat, lng]} icon={markerIcon} />
                )}
            </MapContainer>
            <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                {tileStatus === "loading" ? "Loading map..." : tileStatus === "error" ? "Map tiles failed. You can still use coordinates." : hasPoint ? "Marker selected" : "Tap map to select"}
            </div>
            {hasPoint ? (
                <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded-xl bg-slate-950/80 px-3 py-2 text-xs font-semibold text-white shadow-sm">
                    {lat.toFixed(5)}, {lng.toFixed(5)}
                </div>
            ) : null}
        </div>
    );
}

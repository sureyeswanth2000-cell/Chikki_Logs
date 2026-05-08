export function distanceKmBetween(origin, destination) {
  const lat1 = Number(origin?.lat);
  const lng1 = Number(origin?.lng);
  const lat2 = Number(destination?.lat);
  const lng2 = Number(destination?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) {
    return null;
  }

  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function formatDistance(km) {
  const value = Number(km);
  if (!Number.isFinite(value) || value < 0) {
    return "";
  }
  if (value < 1) {
    return `${Math.max(1, Math.round(value * 1000))} m`;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} km`;
}

const NEAR_TRANSIT_LIMIT_KM = 2;

function transitLabel(type, name) {
  const cleanName = String(name ?? "").trim();
  if (type === "railway") {
    return cleanName ? `${cleanName} railway station` : "Railway station";
  }
  return cleanName ? `${cleanName} bus stand` : "Bus stand";
}

export function getTransitDisplayItems(source, nearLimitKm = NEAR_TRANSIT_LIMIT_KM) {
  const items = [
    {
      type: "railway",
      name: String(source?.nearRailwayName ?? "").trim(),
      distanceKm: Number(source?.nearRailwayKm),
    },
    {
      type: "bus",
      name: String(source?.nearBusName ?? "").trim(),
      distanceKm: Number(source?.nearBusKm),
    },
  ]
    .filter((item) => Number.isFinite(item.distanceKm) && item.distanceKm > 0)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  if (items.length <= 1) {
    return items.map((item) => ({
      ...item,
      label: transitLabel(item.type, item.name),
      formattedDistance: formatDistance(item.distanceKm),
    }));
  }

  const nearbyItems = items.filter((item) => item.distanceKm <= nearLimitKm);
  const displayItems = nearbyItems.length > 0 ? [nearbyItems[0]] : items;
  return displayItems.map((item) => ({
    ...item,
    label: transitLabel(item.type, item.name),
    formattedDistance: formatDistance(item.distanceKm),
  }));
}

export function formatTransitSummary(source) {
  const items = getTransitDisplayItems(source);
  if (items.length === 0) {
    return "Transit distance not available";
  }
  return items.map((item) => `${item.label}: ${item.formattedDistance}`).join(" | ");
}

export function findNearestCity(cities, location) {
  const candidates = (Array.isArray(cities) ? cities : [])
    .map((city) => {
      const distanceKm = distanceKmBetween(location, city);
      if (distanceKm === null) {
        return null;
      }
      return { ...city, distanceKm };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const nearest = candidates[0] ?? null;
  if (!nearest) {
    return null;
  }
  const serviceRadiusKm = Number(nearest.serviceRadiusKm ?? 80);
  return {
    ...nearest,
    inServiceRadius: nearest.distanceKm <= serviceRadiusKm,
  };
}

export function googleMapsDirectionsUrl(destination, origin) {
  const destinationLat = Number(destination?.lat);
  const destinationLng = Number(destination?.lng);
  if (!Number.isFinite(destinationLat) || !Number.isFinite(destinationLng)) {
    return "";
  }
  const params = new URLSearchParams({
    api: "1",
    destination: `${destinationLat},${destinationLng}`,
  });
  const originLat = Number(origin?.lat);
  const originLng = Number(origin?.lng);
  if (Number.isFinite(originLat) && Number.isFinite(originLng)) {
    params.set("origin", `${originLat},${originLng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

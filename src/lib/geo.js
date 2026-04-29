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

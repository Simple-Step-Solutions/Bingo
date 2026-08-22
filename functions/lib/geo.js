/** Great-circle distance in metres. Mirrors calculateDistance in src/lib/utils.ts. */
const distanceMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371e3;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const isFiniteCoord = (v) => typeof v === 'number' && Number.isFinite(v);

const validCoords = (lat, lng) =>
  isFiniteCoord(lat) && isFiniteCoord(lng)
  && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  // 0,0 is in the Gulf of Guinea and is what an uninitialised coordinate pair
  // looks like. Nothing in the Hudson Valley is there.
  && !(lat === 0 && lng === 0);

module.exports = { distanceMeters, validCoords };

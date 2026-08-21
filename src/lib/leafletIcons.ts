import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

/**
 * Point Leaflet at the marker images shipped inside the package.
 *
 * These used to be loaded from cdnjs, which meant the map markers vanished
 * offline (Workbox only precaches our own assets, and the map is the one screen
 * a player is most likely to open with no signal). It also pinned Leaflet 1.7.1
 * images against the 1.9.4 library we actually bundle.
 *
 * Bundling them through Vite also means they get content-hashed filenames and
 * land in the precache manifest, since it globs png.
 */
let applied = false;

export function applyLeafletDefaultIcons() {
  if (applied) return;
  applied = true;

  delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
  });
}

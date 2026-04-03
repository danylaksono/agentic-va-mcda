import type { BasemapPreset } from '../types';
import type { StyleSpecification } from 'maplibre-gl';

const OSM_ATTRIBUTION =
  '&copy; OpenStreetMap contributors | &copy; CARTO';

function rasterStyle(tileUrl: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'basemap-raster',
        type: 'raster',
        source: 'basemap',
      },
    ],
  };
}

export function getBasemapStyle(preset: BasemapPreset): StyleSpecification {
  switch (preset) {
    case 'dark':
      return rasterStyle('https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png');
    case 'positron':
      return rasterStyle('https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png');
    case 'osm':
    default:
      return rasterStyle('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  }
}

export const BASEMAP_PRESETS: BasemapPreset[] = ['osm', 'dark', 'positron'];

import maplibregl, { LngLatBounds } from 'maplibre-gl';
import type { GeoJSONFeatureCollection, ManagedLayer } from '../types';
import type { BasemapPreset } from '../types';
import { defaultBasemapPreset } from '../config';
import { getBasemapStyle } from './basemaps';

const LONDON_CENTER: [number, number] = [-0.1278, 51.5074];

export class MapService {
  private map: maplibregl.Map | null = null;

  private markers: maplibregl.Marker[] = [];

  private popups: maplibregl.Popup[] = [];

  private customLayerIds = new Set<string>();

  private layers = new Map<string, ManagedLayer>();

  private basemapPreset: BasemapPreset = defaultBasemapPreset;

  init(container: HTMLElement): maplibregl.Map {
    if (this.map) return this.map;

    this.map = new maplibregl.Map({
      container,
      style: getBasemapStyle(this.basemapPreset),
      center: LONDON_CENTER,
      zoom: 10.5,
      pitch: 0,
    });

    return this.map;
  }

  getMap(): maplibregl.Map {
    if (!this.map) {
      throw new Error('Map is not initialized.');
    }
    return this.map;
  }

  addH3Layer(
    layerId: string,
    geojson: GeoJSONFeatureCollection,
    colorBy: string,
    opacity = 0.65,
  ): ManagedLayer {
    const map = this.getMap();
    const sourceId = `${layerId}-source`;

    this.removeLayer(layerId);

    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson as unknown as GeoJSON.FeatureCollection,
    });

    const metricValues = geojson.features
      .map((feature) => Number(feature.properties[colorBy]))
      .filter((value) => Number.isFinite(value));

    const minValue = metricValues.length > 0 ? Math.min(...metricValues) : 0;
    const maxValue = metricValues.length > 0 ? Math.max(...metricValues) : 1;
    const hasValueRange = maxValue > minValue;

    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': hasValueRange
          ? [
              'interpolate',
              ['linear'],
              ['coalesce', ['to-number', ['get', colorBy]], minValue],
              minValue,
              '#17a34a',
              minValue + (maxValue - minValue) / 2,
              '#f59f00',
              maxValue,
              '#cf222e',
            ]
          : '#178183',
        'fill-opacity': opacity,
        'fill-outline-color': '#ffffff',
      },
    });

    this.customLayerIds.add(layerId);
    this.fitToFeatureCollection(geojson);

    const layerState: ManagedLayer = {
      id: layerId,
      colorBy,
      opacity,
      visible: true,
      featureCount: geojson.features.length,
      minValue,
      maxValue,
    };

    this.layers.set(layerId, layerState);
    return layerState;
  }

  removeLayer(layerId: string): void {
    const map = this.getMap();
    const sourceId = `${layerId}-source`;

    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }

    this.customLayerIds.delete(layerId);
    this.layers.delete(layerId);
  }

  clearMap(): void {
    const map = this.getMap();

    for (const layerId of [...this.customLayerIds]) {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      const sourceId = `${layerId}-source`;
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    }

    this.customLayerIds.clear();
    this.layers.clear();

    this.markers.forEach((marker) => marker.remove());
    this.popups.forEach((popup) => popup.remove());
    this.markers = [];
    this.popups = [];
  }

  setLayerOpacity(layerId: string, opacity: number): void {
    const map = this.getMap();
    if (!map.getLayer(layerId)) return;

    map.setPaintProperty(layerId, 'fill-opacity', opacity);
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.opacity = opacity;
    }
  }

  setLayerVisibility(layerId: string, visible: boolean): void {
    const map = this.getMap();
    if (!map.getLayer(layerId)) return;

    map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.visible = visible;
    }
  }

  flyTo(center: [number, number], zoom?: number): void {
    const map = this.getMap();
    map.flyTo({ center, zoom: zoom ?? map.getZoom(), duration: 1500 });
  }

  fitBounds(bounds: [[number, number], [number, number]]): void {
    this.getMap().fitBounds(bounds, { padding: 50, duration: 1500 });
  }

  addMarker(lngLat: [number, number], label?: string): void {
    const marker = new maplibregl.Marker({ color: '#0b5fff' }).setLngLat(lngLat);

    if (label) {
      marker.setPopup(new maplibregl.Popup({ offset: 8 }).setText(label));
    }

    marker.addTo(this.getMap());
    this.markers.push(marker);
  }

  addPopup(lngLat: [number, number], htmlContent: string): void {
    const popup = new maplibregl.Popup({ closeButton: true })
      .setLngLat(lngLat)
      .setHTML(htmlContent)
      .addTo(this.getMap());

    this.popups.push(popup);
  }

  getManagedLayers(): ManagedLayer[] {
    return Array.from(this.layers.values());
  }

  setBasemap(preset: BasemapPreset): void {
    const map = this.getMap();
    this.clearMap();
    this.basemapPreset = preset;
    map.setStyle(getBasemapStyle(preset));
  }

  getBasemapPreset(): BasemapPreset {
    return this.basemapPreset;
  }

  private fitToFeatureCollection(geojson: GeoJSONFeatureCollection): void {
    if (geojson.features.length === 0) return;

    const map = this.getMap();
    const allCoordinates: [number, number][] = [];

    const crawlCoordinates = (coords: unknown): void => {
      if (!Array.isArray(coords)) return;
      if (coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
        allCoordinates.push([coords[0], coords[1]]);
        return;
      }
      coords.forEach((item) => crawlCoordinates(item));
    };

    geojson.features.forEach((feature) => {
      crawlCoordinates(feature.geometry.coordinates);
    });

    if (allCoordinates.length === 0) return;

    const bounds = allCoordinates.slice(1).reduce(
      (acc, coord) => acc.extend(coord),
      new LngLatBounds(allCoordinates[0], allCoordinates[0]),
    );

    map.fitBounds(bounds, { padding: 40, maxZoom: 14, duration: 800 });
  }
}

export const mapService = new MapService();

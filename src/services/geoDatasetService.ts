import * as h3 from 'h3-js';
import { duckdbService } from './duckdbService';
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  StoredGeoDataset,
  StoredGeoDatasetFeature,
  StoredGeoDatasetSummary,
} from '../types';

const DB_NAME = 'ued-geo-datasets';
const STORE_NAME = 'datasets';
const DB_VERSION = 1;

function isFeatureCollection(value: unknown): value is GeoJSONFeatureCollection {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as GeoJSONFeatureCollection).type === 'FeatureCollection' &&
      Array.isArray((value as GeoJSONFeatureCollection).features),
  );
}

function isPolygonGeometryType(type: string): type is 'Polygon' | 'MultiPolygon' {
  return type === 'Polygon' || type === 'MultiPolygon';
}

function createDatasetId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `dataset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createTableName(id: string): string {
  return `uploaded_geo_${id.replace(/-/g, '_')}`;
}

function normalizeRing(ring: unknown): number[][] {
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new Error('Polygon rings must contain at least four coordinate pairs.');
  }

  const coordinates = ring.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      throw new Error('Polygon coordinates must be [lng, lat] pairs.');
    }

    const lon = Number(point[0]);
    const lat = Number(point[1]);

    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error('Polygon coordinates must contain finite numeric values.');
    }

    return [lon, lat];
  });

  const [firstLon, firstLat] = coordinates[0];
  const [lastLon, lastLat] = coordinates[coordinates.length - 1];
  if (firstLon !== lastLon || firstLat !== lastLat) {
    coordinates.push([firstLon, firstLat]);
  }

  return coordinates;
}

function normalizePolygonCoordinates(coordinates: unknown): number[][][] {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    throw new Error('Polygon geometry has no coordinates.');
  }

  return coordinates.map((ring) => normalizeRing(ring));
}

function normalizeMultiPolygonCoordinates(coordinates: unknown): number[][][][] {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    throw new Error('MultiPolygon geometry has no coordinates.');
  }

  return coordinates.map((polygon) => normalizePolygonCoordinates(polygon));
}

function polygonToCellsByFeature(geometry: GeoJSONFeature['geometry'], resolution: number): string[] {
  if (geometry.type === 'Polygon') {
    return [...new Set(h3.polygonToCells(normalizePolygonCoordinates(geometry.coordinates), resolution, true))];
  }

  if (geometry.type === 'MultiPolygon') {
    const cells = new Set<string>();
    for (const polygon of normalizeMultiPolygonCoordinates(geometry.coordinates)) {
      h3.polygonToCells(polygon, resolution, true).forEach((cell) => cells.add(cell));
    }
    return [...cells];
  }

  throw new Error('Only Polygon and MultiPolygon geometries are supported for uploads.');
}

function assertSupportedFeature(feature: GeoJSONFeature, index: number): void {
  if (!feature || feature.type !== 'Feature') {
    throw new Error(`Feature ${index + 1} is not a valid GeoJSON Feature.`);
  }

  if (!feature.geometry || !isPolygonGeometryType(feature.geometry.type)) {
    throw new Error(`Feature ${index + 1} must be a Polygon or MultiPolygon.`);
  }
}

function createFeatureId(datasetId: string, index: number): string {
  return `${datasetId}-feature-${index + 1}`;
}

function txComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
  });
}

export class GeoDatasetService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
    });

    return this.dbPromise;
  }

  private async putRecord(record: StoredGeoDataset): Promise<void> {
    const db = await this.getDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(record);
    await txComplete(transaction);
  }

  private async deleteRecord(id: string): Promise<void> {
    const db = await this.getDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    await txComplete(transaction);
  }

  async listDatasets(): Promise<StoredGeoDatasetSummary[]> {
    const db = await this.getDatabase();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();

    const records = await new Promise<StoredGeoDataset[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredGeoDataset[]);
      request.onerror = () => reject(request.error ?? new Error('Failed to read datasets.'));
    });

    return records
      .map(({ id, name, layerId, tableName, resolution, featureCount, cellCount, createdAt }) => ({
        id,
        name,
        layerId,
        tableName,
        resolution,
        featureCount,
        cellCount,
        createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async loadDataset(id: string): Promise<StoredGeoDataset | null> {
    const db = await this.getDatabase();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);

    const record = await new Promise<StoredGeoDataset | undefined>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredGeoDataset | undefined);
      request.onerror = () => reject(request.error ?? new Error('Failed to load dataset.'));
    });
    return record ?? null;
  }

  async deleteDataset(id: string): Promise<void> {
    const record = await this.loadDataset(id);
    await this.deleteRecord(id);

    if (record) {
      await duckdbService.dropPolygonDataset(record.tableName);
    }
  }

  async importGeoJsonFile(file: File, resolution: number): Promise<StoredGeoDataset> {
    const raw = JSON.parse(await file.text()) as unknown;

    if (!isFeatureCollection(raw)) {
      throw new Error('Upload a GeoJSON FeatureCollection.');
    }

    const datasetId = createDatasetId();
    const tableName = createTableName(datasetId);
    const features: StoredGeoDatasetFeature[] = raw.features.map((feature, index) => {
      assertSupportedFeature(feature, index);

      return {
        id: createFeatureId(datasetId, index),
        index: index + 1,
        geometryType: feature.geometry.type as 'Polygon' | 'MultiPolygon',
        properties: { ...(feature.properties || {}) },
        h3Cells: polygonToCellsByFeature(feature.geometry, resolution),
      };
    });

    const dataset: StoredGeoDataset = {
      id: datasetId,
      name: file.name.replace(/\.(geo)?json$/i, '') || 'uploaded-dataset',
      layerId: `${datasetId}-h3`,
      tableName,
      resolution,
      featureCount: features.length,
      cellCount: new Set(features.flatMap((feature) => feature.h3Cells)).size,
      createdAt: Date.now(),
      rawGeoJson: raw,
      features,
    };

    await this.putRecord(dataset);
    await duckdbService.registerPolygonDataset(dataset);

    return dataset;
  }

  buildLayerFeatureCollection(dataset: StoredGeoDataset): GeoJSONFeatureCollection {
    const cellSources = new Map<string, Set<string>>();

    for (const feature of dataset.features) {
      for (const h3Index of feature.h3Cells) {
        const sources = cellSources.get(h3Index) ?? new Set<string>();
        sources.add(feature.id);
        cellSources.set(h3Index, sources);
      }
    }

    return {
      type: 'FeatureCollection',
      features: [...cellSources.entries()].map(([h3Index, sources]) => ({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [h3.cellToBoundary(h3Index, true)],
        },
        properties: {
          h3_index: h3Index,
          h3_value: sources.size,
          source_feature_count: sources.size,
          dataset_id: dataset.id,
          dataset_name: dataset.name,
        },
      })),
    };
  }
}

export const geoDatasetService = new GeoDatasetService();
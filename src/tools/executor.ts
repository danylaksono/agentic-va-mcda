import { duckdbService } from '../services/duckdbService';
import { mapService } from '../services/mapService';
import type {
  BasemapPreset,
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  ToolCall,
  ToolExecutionResult,
} from '../types';

const NUMERIC_COLUMNS = [
  'energy_demand_kwh',
  'solar_potential_kwh',
  'co2_savings_tonnes',
  'heat_pump_viability',
  'avg_energy_demand_kwh',
  'avg_solar_potential_kwh',
  'avg_co2_savings_tonnes',
  'avg_heat_pump_viability',
] as const;

function isSelectQuery(sql: string): boolean {
  return /^\s*select\s+/i.test(sql);
}

function isBasemapPreset(value: string): value is BasemapPreset {
  return value === 'osm' || value === 'dark' || value === 'positron';
}

function asLngLat(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('Expected coordinate array [lon, lat].');
  }
  const lon = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error('Invalid coordinate values.');
  }
  return [lon, lat];
}

export class ToolExecutor {
  async execute(toolCall: ToolCall): Promise<ToolExecutionResult> {
    const toolName = toolCall.function.name;
    let args: Record<string, unknown> = {};

    try {
      args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
    } catch {
      return { success: false, error: 'Tool arguments are not valid JSON.' };
    }

    try {
      switch (toolName) {
        case 'setBasemap':
          return this.setBasemap(String(args.preset ?? ''));
        case 'listTables':
          return await this.listTables();
        case 'getTableSchema':
          return await this.getTableSchema(String(args.tableName ?? ''));
        case 'runH3SpatialQuery':
          return await this.runH3SpatialQuery(String(args.sql ?? ''));
        case 'addH3Layer':
          return this.addH3Layer(args);
        case 'flyTo':
          mapService.flyTo(asLngLat(args.center), Number(args.zoom));
          return { success: true, message: 'Map camera moved.' };
        case 'fitBounds': {
          const bounds = args.bounds as [[number, number], [number, number]];
          mapService.fitBounds(bounds);
          return { success: true, message: 'Map view fitted to bounds.' };
        }
        case 'addMarker':
          mapService.addMarker(asLngLat(args.lngLat), args.label ? String(args.label) : undefined);
          return { success: true, message: 'Marker added.' };
        case 'addPopup':
          mapService.addPopup(asLngLat(args.lngLat), String(args.htmlContent ?? ''));
          return { success: true, message: 'Popup added.' };
        case 'removeLayer':
          mapService.removeLayer(String(args.layerId ?? ''));
          return { success: true, message: `Layer ${String(args.layerId)} removed.` };
        case 'clearMap':
          mapService.clearMap();
          return { success: true, message: 'Custom map content cleared.' };
        default:
          return { success: false, error: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed.',
      };
    }
  }

  private setBasemap(presetRaw: string): ToolExecutionResult {
    const preset = presetRaw.trim().toLowerCase();
    if (!isBasemapPreset(preset)) {
      return {
        success: false,
        error: "setBasemap preset must be one of: 'osm', 'dark', 'positron'.",
      };
    }

    mapService.setBasemap(preset);
    return {
      success: true,
      message: `Basemap changed to ${preset}.`,
      data: { currentBasemap: mapService.getBasemapPreset() },
    };
  }

  private async listTables(): Promise<ToolExecutionResult> {
    const tables = await duckdbService.listTables();
    return {
      success: true,
      message: `Found ${tables.length} table(s).`,
      data: tables,
    };
  }

  private async getTableSchema(tableName: string): Promise<ToolExecutionResult> {
    if (!tableName.trim()) {
      return {
        success: false,
        error: 'getTableSchema requires a tableName.',
      };
    }

    const schema = await duckdbService.getTableSchema(tableName);
    return {
      success: true,
      message: `Loaded schema for ${tableName}.`,
      data: schema,
    };
  }

  private async runH3SpatialQuery(sql: string): Promise<ToolExecutionResult> {
    if (!sql || !isSelectQuery(sql)) {
      return {
        success: false,
        error: 'runH3SpatialQuery only accepts SELECT queries.',
      };
    }

    const rows = await duckdbService.query(sql);

    const features: GeoJSONFeature[] = rows
      .map((row) => {
        if (!row.geom || typeof row.geom !== 'string') return null;

        try {
          const geometry = JSON.parse(row.geom);
          const properties = { ...row } as Record<string, unknown>;
          delete properties.geom;

          return {
            type: 'Feature',
            geometry,
            properties,
          } as GeoJSONFeature;
        } catch {
          return null;
        }
      })
      .filter((feature): feature is GeoJSONFeature => Boolean(feature));

    const geojson: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    const stats: Record<string, { min: number; max: number; avg: number }> = {};

    for (const column of NUMERIC_COLUMNS) {
      const values = rows
        .map((row) => Number(row[column]))
        .filter((value) => Number.isFinite(value));

      if (!values.length) continue;

      const min = Math.min(...values);
      const max = Math.max(...values);
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      stats[column] = { min, max, avg };
    }

    return {
      success: true,
      message: `Query returned ${rows.length} rows and ${features.length} features.`,
      rowCount: rows.length,
      geojson: JSON.stringify(geojson),
      stats,
    };
  }

  private addH3Layer(args: Record<string, unknown>): ToolExecutionResult {
    const layerId = String(args.layerId ?? '').trim();
    const colorBy = String(args.colorBy ?? '').trim();

    if (!layerId || !colorBy) {
      return {
        success: false,
        error: 'addH3Layer requires non-empty layerId and colorBy.',
      };
    }

    let geojson: GeoJSONFeatureCollection;
    try {
      geojson = JSON.parse(String(args.geojson ?? '{}')) as GeoJSONFeatureCollection;
    } catch {
      return {
        success: false,
        error: 'addH3Layer received invalid GeoJSON string.',
      };
    }

    if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
      return {
        success: false,
        error: 'addH3Layer expects a GeoJSON FeatureCollection.',
      };
    }

    const opacity = args.opacity ? Number(args.opacity) : 0.65;
    const clampedOpacity = Math.max(0.3, Math.min(0.95, opacity));

    const layer = mapService.addH3Layer(layerId, geojson, colorBy, clampedOpacity);

    return {
      success: true,
      message: `Layer ${layer.id} added with ${layer.featureCount} hexagons.`,
    };
  }
}

export const toolExecutor = new ToolExecutor();

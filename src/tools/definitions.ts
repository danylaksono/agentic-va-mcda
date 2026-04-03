import type { ToolDefinition } from '../types';

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'setBasemap',
      description:
        'Changes basemap style. Supported presets: osm, dark, positron. Use osm by default unless user requests otherwise.',
      parameters: {
        type: 'object',
        properties: {
          preset: {
            type: 'string',
            enum: ['osm', 'dark', 'positron'],
            description: 'Basemap preset name',
          },
        },
        required: ['preset'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listTables',
      description:
        'Lists available DuckDB tables and short descriptions. Use when schema is unclear.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTableSchema',
      description:
        'Returns exact column names and data types for one table. Use after listTables before SQL.',
      parameters: {
        type: 'object',
        properties: {
          tableName: {
            type: 'string',
            description: 'Table name returned by listTables.',
          },
        },
        required: ['tableName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runH3SpatialQuery',
      description:
        'Execute DuckDB SQL using spatial and H3 functions over urban_energy. Query must return a geom column containing GeoJSON geometry text per row.',
      parameters: {
        type: 'object',
        properties: {
          sql: {
            type: 'string',
            description:
              'DuckDB SQL SELECT statement. Include geom via h3_cell_to_geojson(...).',
          },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addH3Layer',
      description:
        'Adds a choropleth hex layer to the map from a GeoJSON FeatureCollection string and metric field.',
      parameters: {
        type: 'object',
        properties: {
          layerId: { type: 'string', description: 'Unique layer id' },
          geojson: { type: 'string', description: 'Stringified FeatureCollection' },
          colorBy: { type: 'string', description: 'Numeric property name for color ramp' },
          opacity: { type: 'number', description: 'Layer opacity (0.3-0.95)' },
        },
        required: ['layerId', 'geojson', 'colorBy'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'flyTo',
      description: 'Moves the map camera to [lon, lat] and optional zoom.',
      parameters: {
        type: 'object',
        properties: {
          center: {
            type: 'array',
            items: { type: 'number' },
            description: '[longitude, latitude]',
          },
          zoom: { type: 'number' },
        },
        required: ['center'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fitBounds',
      description: 'Fits map to [[minLon,minLat],[maxLon,maxLat]].',
      parameters: {
        type: 'object',
        properties: {
          bounds: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'number' },
            },
            description: 'Bounding box as [[minLon,minLat],[maxLon,maxLat]]',
          },
        },
        required: ['bounds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addMarker',
      description: 'Adds a map marker at [lon, lat] with an optional label.',
      parameters: {
        type: 'object',
        properties: {
          lngLat: {
            type: 'array',
            items: { type: 'number' },
            description: '[longitude, latitude]',
          },
          label: { type: 'string' },
        },
        required: ['lngLat'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addPopup',
      description: 'Adds a popup at [lon,lat] with provided HTML content.',
      parameters: {
        type: 'object',
        properties: {
          lngLat: {
            type: 'array',
            items: { type: 'number' },
            description: '[longitude, latitude]',
          },
          htmlContent: { type: 'string' },
        },
        required: ['lngLat', 'htmlContent'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'removeLayer',
      description: 'Removes a custom layer by layer id.',
      parameters: {
        type: 'object',
        properties: {
          layerId: { type: 'string' },
        },
        required: ['layerId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clearMap',
      description: 'Clears all custom layers, markers, and popups from map.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
];

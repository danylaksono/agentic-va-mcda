# Urban Energy Decarbonisation Explorer (UED Explorer)

Browser-native urban energy analytics for non-technical planners and sustainability teams.

## Current Implementation

- React + TypeScript + Vite frontend.
- MapLibre map with H3 choropleth layer support.
- DuckDB-WASM in-browser analytics with spatial extension and optional h3 extension.
- assistant-ui chat runtime and UI.
- Native tool-calling agent loop (OpenAI-compatible API).
- Structured tool call/result cards rendered inside the thread.
- Prompt-caching friendly system prompt layout.
- Dynamic schema injection and schema discovery tools.
- Basemap selector in UI plus AI basemap tool (`osm`, `dark`, `positron`).
- OSM is the default basemap.

## Quick Start

1. Install dependencies.

```bash
npm install
```

2. Create local environment file.

```bash
cp .env.example .env
```

3. Set an API key in `.env`.

4. Run development server.

```bash
npm run dev
```

## Environment Variables

```bash
VITE_LLM_API_URL=https://openrouter.ai/api/v1/chat/completions
VITE_LLM_MODEL=meta-llama/llama-3.3-70b-instruct
VITE_APP_TITLE=Urban Energy Decarb Explorer
VITE_APP_REFERER=http://localhost
VITE_BASEMAP_PRESET=osm
VITE_ENABLE_PROMPT_CACHING=true
VITE_PROMPT_CACHE_TTL_SECONDS=300
VITE_OPENROUTER_CACHE_CONTROL=
VITE_OPENROUTER_API_KEY=
OPENROUTER_API_KEY=your-openrouter-api-key-here
```

Notes:
- `OPENROUTER_API_KEY` is injected by Vite config for convenience.
- `VITE_OPENROUTER_API_KEY` is optional and directly client-visible.
- For public production deployments, a backend proxy is recommended instead of exposing provider keys to browser clients.

## Tooling (Agent)

- `setBasemap(preset)`
- `listTables()`
- `getTableSchema(tableName)`
- `runH3SpatialQuery(sql)`
- `addH3Layer(layerId, geojson, colorBy, opacity?)`
- `flyTo(center, zoom?)`
- `fitBounds(bounds)`
- `addMarker(lngLat, label?)`
- `addPopup(lngLat, htmlContent)`
- `removeLayer(layerId)`
- `clearMap()`

## UX Features

- assistant-ui thread with local runtime adapter.
- In-thread tool cards with structured args/result display.
- Layer manager for visibility, opacity, and removal.
- Basemap dropdown for manual switching.
- AI can also switch basemap via tool call.

## Performance Strategy

- assistant-ui chat shell is lazy-loaded via React lazy/suspense.
- DuckDB-WASM is loaded on first analytics use, not at app startup.
- Prompt prefix remains stable to support provider prompt caching.

## Architecture Overview

- `src/components/AssistantChat.tsx`: assistant-ui runtime adapter and thread view.
- `src/components/ToolCallCard.tsx`: custom tool-call renderer.
- `src/components/Sidebar.tsx`: chat panel, controls, basemap selector.
- `src/components/Map.tsx`: map container host.
- `src/services/mapService.ts`: map actions, layers, camera, basemap switching.
- `src/services/basemaps.ts`: basemap style presets.
- `src/services/duckdbService.ts`: lazy DuckDB init and query helpers.
- `src/tools/definitions.ts`: JSON schema tool definitions.
- `src/tools/executor.ts`: defensive tool executor.
- `src/agent/agentLoop.ts`: multi-turn agent loop, retries, tool trace capture.

## Example Prompts

- Show H3 hex grid of London at resolution 9 colored by average energy demand.
- Switch basemap to dark and highlight areas with high solar potential.
- Compare CO2 savings between two zones and fly to the better one.

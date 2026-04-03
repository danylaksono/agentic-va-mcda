# Urban Energy Decarbonisation Explorer (Phase 1)

Browser-native urban energy analytics with:
- React + TypeScript + Vite
- MapLibre GL JS for interactive maps
- DuckDB-WASM + spatial extension (+ h3 extension when available)
- Native LLM tool-calling loop (OpenAI-compatible endpoint)

This repository now implements the first PLAN slice:
- Map + DuckDB foundation
- Synthetic London urban energy dataset in-browser
- Robust tool definitions and safe tool executor
- Multi-step tool-calling agent loop
- Chat-first dashboard with layer manager and tool logs
- Prompt-caching friendly static prompt prefix + dynamic schema injection
- Lazy schema discovery tools (`listTables`, `getTableSchema`)

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Set API key in `.env` or directly in the app UI.

4. Run locally:

```bash
npm run dev
```

## Environment Variables

```bash
VITE_LLM_API_URL=https://openrouter.ai/api/v1/chat/completions
VITE_LLM_MODEL=meta-llama/llama-3.3-70b-instruct
VITE_APP_TITLE=Urban Energy Decarb Explorer
VITE_APP_REFERER=http://localhost
VITE_MAP_STYLE=https://demotiles.maplibre.org/style.json
VITE_ENABLE_PROMPT_CACHING=true
VITE_PROMPT_CACHE_TTL_SECONDS=300
VITE_OPENROUTER_CACHE_CONTROL=
```

## Current Tooling

- `runH3SpatialQuery(sql)`
- `listTables()`
- `getTableSchema(tableName)`
- `addH3Layer(layerId, geojson, colorBy, opacity?)`
- `flyTo(center, zoom?)`
- `fitBounds(bounds)`
- `addMarker(lngLat, label?)`
- `addPopup(lngLat, htmlContent)`
- `removeLayer(layerId)`
- `clearMap()`

## Example Query

"Show H3 hex grid of London at resolution 9 colored by average energy demand and add a popup where CO2 savings are highest."

## Project Structure

- `src/services/mapService.ts`: Map lifecycle + safe map actions
- `src/services/duckdbService.ts`: DuckDB-WASM init, extensions, query API
- `src/tools/definitions.ts`: LLM tool schemas
- `src/tools/executor.ts`: Defensive tool execution layer
- `src/agent/agentLoop.ts`: multi-turn tool-calling loop with retry
- `src/components/Sidebar.tsx`: Chat, logs, layer manager
- `src/components/Map.tsx`: map canvas host

## Next Planned Steps

- Integrate assistant-ui for richer chat UX and structured tool feedback
- Add dynamic legend rendering and export actions (GeoJSON/CSV/screenshot)
- Add ingestion flows for CSV/GeoJSON/GeoParquet
- Add unit tests for tool executor + mocked integration tests for agent loop

## Token Efficiency Strategy

Implemented patterns for reducing context bloat in multi-step loops:
- Prompt caching layout: stable static prefix (instructions + tool summary + schema context) at top.
- Schema lazy loading tools: the model can discover schema only when needed.
- Dynamic schema injection: app preselects relevant table schema from user query terms.

# Urban Energy Decarbonisation Explorer (UED Explorer)

## Project Overview
Build a **fully browser-based, performant visual analytics interface** targeted at layman urban planners and energy professionals. The app enables natural-language exploration of urban energy data with a strong focus on **energy decarbonisation** scenarios (building energy demand, solar potential, CO₂ savings, heat-pump viability, EV charging potential, district heating, etc.).

The core philosophy is:
- **H3 hexagonal grids** as the primary spatial unit for performance and visual clarity at city/neighbourhood scale.
- **DuckDB-WASM + spatial extensions** for all heavy geospatial analytics directly in the browser (no backend server for queries). Use the DuckDB H3 extension (in DuckDB-WASM) when available, but also includes client-side h3-js as a fallback / auxiliary path.
- **MapLibre GL JS** for fast, interactive 2D mapping.
- **Native LLM tool calling** (function calling) for reliable, multi-step reasoning and safe execution of map + analysis actions.
- **Zero-trust / client-side only** execution where possible — everything runs in the user's browser for privacy and low latency.
- **Layman-friendly**: Users type plain English questions; the AI handles complex H3 queries, data aggregation, visualisation, and insights automatically.

Target users: Urban planners, sustainability officers, local government staff, consultants — people who are not coders but need to explore "what-if" decarbonisation scenarios quickly.

## Core Technical Stack (Production-Grade)
- **Frontend Framework**: Modern Vite + React + TypeScript (or plain vanilla JS if keeping it ultra-light). 
**Styling**: TailwindCSS + shadcn/ui components
- **LLM Chat UI**: **assistant-ui** (`@assistant-ui/react` and related packages) for the chat interface, tool calling, and conversation management.
- **Mapping**: MapLibre GL JS (latest version).
- **Analytics Engine**: DuckDB-WASM (latest) with:
  - `spatial` extension
  - `h3` extension (from community)
- **AI Layer**: OpenAI-compatible API with **native tool/function calling** (tools array + tool_choice: "auto").
  - Recommended providers (configurable): Currently compatible with OpenAI's API (e.g., OpenRouter tool calling https://openrouter.ai/docs/guides/features/tool-calling#a-simple-agentic-loop).
- **State Management**: React hooks / Zustand or a simple custom store for map state, loaded layers, conversation history.
- **Styling & UX**: Clean, professional dashboard with side panel for chat, legend, layer controls, and export options. Dark/light mode support.
- **Tool Execution**: Custom safe executor that bridges assistant-ui tool calls → MapLibre actions and DuckDB queries.

## UI Strategy for the AI Chat Interface
  Use **assistant-ui**[](https://github.com/assistant-ui/assistant-ui) as the primary LLM-compatible chat UI library.
- Leverage its built-in support for tool calling and conversation management.
- Customize the system prompt to include detailed instructions and examples for the tools.
- Implement a custom tool executor that safely maps tool calls to actual MapLibre and DuckDB operations.
- Ensure the UI provides clear feedback during tool execution (loading spinners, error messages) and concise summaries after completion.
- future plan might include generative UI (e.g., comparing two scenarios side by side) but start with a single map view for simplicity.

## Key Features & Requirements

### 1. Natural Language Interface (AI Agent)
- User types questions in plain English, e.g.:
  - "Show H3 hex grid of Greater London at resolution 9 colored by average building energy demand (kWh/m²)"
  - "Highlight areas with high solar potential and low heat-pump viability within 5km of the city centre"
  - "Compare CO₂ savings potential between two neighbourhoods and fly to the better one"
  - "Clear the map and add markers for priority zones with >50 tonnes CO₂ savings"
- The agent uses **native tool calling** in a conversation loop (ReAct-style) until the task is complete, then gives a concise plain-English summary with insights.

### 2. First-Class Tools (Must Be Robust)
Define these tools with clear JSON Schema descriptions:

- `runH3SpatialQuery(sql: string)` — Executes DuckDB SQL using H3 functions (`h3_latlng_to_cell`, `h3_cell_to_geojson`, etc.). Returns GeoJSON FeatureCollection + summary stats. The table(s) include columns like: `lat`, `lon`, `energy_demand_kwh`, `solar_potential_kwh`, `co2_savings_tonnes`, `heat_pump_viability`, etc.
- `addH3Layer(layerId, geojson, colorBy, opacity?)` — Adds a choropleth fill layer with data-driven coloring (e.g., green-yellow-red ramp based on the metric). Automatically handles source/layer creation and cleanup.
- `flyTo(center: [lon, lat], zoom?)`
- `fitBounds(bounds: [[minLon, minLat], [maxLon, maxLat]])`
- `addMarker(lngLat, label?)`
- `addPopup(lngLat, htmlContent)`
- `removeLayer(layerId)`
- `clearMap()` — Removes all custom layers/markers while keeping the base map.

Support parallel tool calls when possible. Include proper error handling and feedback to the LLM.

### 3. Data Handling
- **In-browser sample dataset** (synthetic London-area buildings with energy/decarb metrics) for immediate demo.
- Support loading user-provided data:
  - GeoJSON / GeoParquet / CSV with lat/lon + metrics (use DuckDB to ingest and index into H3 on-the-fly).
  - Pre-computed H3 tables for large datasets.
- Implement efficient H3 resolution handling (auto-suggest resolution 8–11 based on zoom/map extent).

### 4. Visual Analytics Features
- Automatic legend generation for colored H3 layers (with min/max values and units).
- Layer manager (toggle visibility, adjust opacity, remove).
- Export options: Screenshot, GeoJSON download of current view, CSV of aggregated stats.
- Multivariate glyph support (future extension — allow custom glyph rendering on top of H3 or points).
- Responsive design that works on desktop and larger tablets.

### 5. Production Requirements
- **Performance**:
  - Keep initial bundle < 5MB if possible.
  - Lazy-load heavy libraries (DuckDB, MapLibre).
  - Use Web Workers where beneficial for DuckDB queries.
  - Optimize H3 queries to avoid blocking the UI (show loading indicators).
- **Reliability & Error Handling**:
  - Graceful fallbacks when tools fail.
  - Detailed logging (visible in dev mode only).
  - Rate-limit handling and retry logic for the LLM provider.
- **Security**:
  - No `eval()` or raw code execution.
  - API keys stored only in environment variables or user-provided (never hardcoded in production build).
  - CSP headers if deployed.
- **Observability**:
  - Conversation history persistence (localStorage or IndexedDB).
  - Basic analytics on query types (optional).
- **Configurability**:
  - Easy switching of LLM provider/model via config file or UI.
  - Support multiple base map styles.
  - Theme customization.
- **Deployment**:
  - Static hosting (Vercel, Netlify, Cloudflare Pages, GitHub Pages).
  - Optional self-hosted LiteLLM gateway for zero-fee routing and caching.
  - PWA support for offline use (cache DuckDB and base assets).

## Architecture Overview
1. **UI Layer** — React components: Map container, Chat input + history, Controls panel, Legend.
2. **Map Service** — Wrapper around MapLibre with methods for safe layer addition/removal.
3. **DuckDB Service** — Singleton managing DB instance, extensions, and query execution. Expose helper functions for common H3 patterns.
4. **Tool Executor** — Safe functions that map tool calls → actual MapLibre/DuckDB operations.
5. **Agent Loop** — Conversation manager that sends messages + tools to the LLM provider, handles tool calls, feeds results back, and stops when no more tools are needed.
6. **Provider Abstraction** — Single client that can switch between Groq, Fireworks, OpenRouter, etc., with consistent tool-calling format.

## Non-Functional Requirements
- **Usability**: The interface must feel magical to non-technical users — minimal buttons, maximum natural language power.
- **Speed**: Most queries should complete in < 3–5 seconds on a modern laptop (including map update).
- **Accessibility**: ARIA labels, keyboard navigation, high-contrast mode.
- **Extensibility**: Clean code structure so future tools (e.g., routing, scenario comparison, multivariate glyphs) can be added easily.
- **Testing**: Unit tests for tool executors, integration tests for agent loop with mocked LLM responses.

## Deliverables Expected
Build this as a complete, production-ready repository with:
- `vite.config.ts` + React + TypeScript setup
- Clear folder structure (`src/components`, `src/services`, `src/tools`, `src/agent`, etc.)
- Environment variable handling (`VITE_LLM_PROVIDER`, API keys, etc.)
- Comprehensive README with setup, usage examples, and deployment instructions
- Sample data loading scripts
- Comments explaining key decisions (especially around tool calling reliability and H3 performance)

Start by creating the project skeleton with Vite + React + TypeScript, then implement the DuckDB + MapLibre foundation, then the tool definitions and agent loop. Prioritise making the H3 query → layer visualisation loop rock-solid before adding polish.

Focus on reliability of tool calling above all — use precise tool descriptions, good examples in the system prompt, and defensive execution code.

Now, build this project step by step from the ground up.
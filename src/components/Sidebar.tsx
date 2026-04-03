import { Suspense, lazy } from 'react';
import type { BasemapPreset, ChatMessage, ChatRunOutput, ManagedLayer } from '../types';

const AssistantChat = lazy(() => import('./AssistantChat'));

interface SidebarProps {
  status: string;
  apiKey: string;
  onApiKeyChange: (apiKey: string) => void;
  onRunPrompt: (prompt: string, history: ChatMessage[]) => Promise<ChatRunOutput>;
  onClearMap: () => void;
  currentBasemap: BasemapPreset;
  onBasemapChange: (preset: BasemapPreset) => void;
  logs: string[];
  layers: ManagedLayer[];
  onChangeLayerOpacity: (layerId: string, opacity: number) => void;
  onToggleLayerVisibility: (layerId: string, visible: boolean) => void;
  onRemoveLayer: (layerId: string) => void;
}

export default function Sidebar({
  status,
  apiKey,
  onApiKeyChange,
  onRunPrompt,
  onClearMap,
  currentBasemap,
  onBasemapChange,
  logs,
  layers,
  onChangeLayerOpacity,
  onToggleLayerVisibility,
  onRemoveLayer,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <section className="panel hero-panel">
        <h1>Urban Energy Decarb Explorer</h1>
        <p>
          Ask in plain English. The agent can run H3/DuckDB analysis and update the map
          with tool calls.
        </p>
      </section>

      <section className="panel">
        <label htmlFor="api-key-input">OpenRouter API key (optional if set in .env)</label>
        <input
          id="api-key-input"
          className="text-input"
          type="password"
          value={apiKey}
          onChange={(event) => onApiKeyChange(event.target.value)}
          placeholder="sk-or-v1-..."
          autoComplete="off"
        />
        <div className="status-line">{status}</div>
      </section>

      <section className="panel">
        <label htmlFor="basemap-select">Basemap</label>
        <select
          id="basemap-select"
          className="text-input"
          value={currentBasemap}
          onChange={(event) => onBasemapChange(event.target.value as BasemapPreset)}
        >
          <option value="osm">OpenStreetMap</option>
          <option value="dark">Dark</option>
          <option value="positron">Positron</option>
        </select>

      </section>

      <section className="panel">
        <div className="actions-row">
          <button type="button" onClick={onClearMap} className="secondary-btn">
            Clear Map
          </button>
        </div>
      </section>

      <section className="panel scroll-panel">
        <h2>Assistant (assistant-ui)</h2>
        <Suspense fallback={<p className="muted">Loading assistant chat UI...</p>}>
          <AssistantChat onRunPrompt={onRunPrompt} />
        </Suspense>
      </section>

      <section className="panel scroll-panel">
        <h2>Layer Manager</h2>
        {layers.length === 0 && <p className="muted">No AI layers yet.</p>}
        {layers.map((layer) => (
          <div key={layer.id} className="layer-card">
            <div className="layer-title">{layer.id}</div>
            <div className="layer-meta">
              <span>metric: {layer.colorBy}</span>
              <span>
                range: {layer.minValue.toFixed(2)} - {layer.maxValue.toFixed(2)}
              </span>
              <span>cells: {layer.featureCount}</span>
            </div>
            <div className="layer-controls">
              <label>
                visible
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={(event) =>
                    onToggleLayerVisibility(layer.id, event.target.checked)
                  }
                />
              </label>
              <label>
                opacity
                <input
                  type="range"
                  min={0.3}
                  max={0.95}
                  step={0.05}
                  value={layer.opacity}
                  onChange={(event) =>
                    onChangeLayerOpacity(layer.id, Number(event.target.value))
                  }
                />
              </label>
              <button type="button" className="ghost-btn" onClick={() => onRemoveLayer(layer.id)}>
                remove
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="panel scroll-panel">
        <h2>Tool Logs</h2>
        {logs.length === 0 && <p className="muted">No tool calls yet.</p>}
        {logs.map((log, index) => (
          <div key={`${log}-${index}`} className="log-item">
            {log}
          </div>
        ))}
      </section>
    </aside>
  );
}

import { useCallback, useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import Map from './components/Map';
import { duckdbService } from './services/duckdbService';
import { geoDatasetService } from './services/geoDatasetService';
import { mapService } from './services/mapService';
import { TOOL_DEFINITIONS } from './tools/definitions';
import { toolExecutor } from './tools/executor';
import { runAgentLoop } from './agent/agentLoop';
import { llmConfig } from './config';
import type {
  BasemapPreset,
  ChatMessage,
  ChatRunOutput,
  ManagedLayer,
  StoredGeoDatasetSummary,
} from './types';
import './App.css';

const API_KEY_STORAGE = 'ued-openrouter-key';

function App() {
  const [status, setStatus] = useState('Initializing map and DuckDB...');
  const [apiKey, setApiKey] = useState(
    localStorage.getItem(API_KEY_STORAGE) || llmConfig.defaultApiKey || '',
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [layers, setLayers] = useState<ManagedLayer[]>([]);
  const [currentBasemap, setCurrentBasemap] = useState<BasemapPreset>('osm');
  const [datasets, setDatasets] = useState<StoredGeoDatasetSummary[]>([]);
  const [uploadStatus, setUploadStatus] = useState('No uploaded datasets yet.');
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    localStorage.setItem(API_KEY_STORAGE, apiKey);
  }, [apiKey]);

  const refreshMapState = useCallback(() => {
    setLayers(mapService.getManagedLayers());
    setCurrentBasemap(mapService.getBasemapPreset());
  }, []);

  const refreshDatasets = useCallback(async () => {
    const storedDatasets = await geoDatasetService.listDatasets();
    setDatasets(storedDatasets);
  }, []);

  const renderStoredDatasets = useCallback(async () => {
    const storedDatasets = await geoDatasetService.listDatasets();
    for (const datasetSummary of storedDatasets) {
      const dataset = await geoDatasetService.loadDataset(datasetSummary.id);
      if (!dataset) continue;
      mapService.addH3Layer(
        dataset.layerId,
        geoDatasetService.buildLayerFeatureCollection(dataset),
        'h3_value',
        0.68,
      );
    }
    refreshMapState();
    setDatasets(storedDatasets);
  }, [refreshMapState]);

  const handleMapReady = useCallback(async (container: HTMLDivElement) => {
    try {
      mapService.init(container);
      refreshMapState();
      setMapReady(true);
      await refreshDatasets();
      await renderStoredDatasets();
      setStatus('Map ready. DuckDB + H3 analytics will load on first analysis request.');
    } catch (error) {
      setStatus(
        `Initialization failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }, [refreshDatasets, refreshMapState, renderStoredDatasets]);

  const handleImportGeoJson = useCallback(
    async (file: File, resolution: number) => {
      setUploadStatus(`Importing ${file.name} at H3 resolution ${resolution}...`);

      try {
        const dataset = await geoDatasetService.importGeoJsonFile(file, resolution);

        if (mapReady) {
          mapService.addH3Layer(
            dataset.layerId,
            geoDatasetService.buildLayerFeatureCollection(dataset),
            'h3_value',
            0.68,
          );
          refreshMapState();
        }

        await refreshDatasets();
        setUploadStatus(
          `Imported ${dataset.name} with ${dataset.featureCount} feature(s) and ${dataset.cellCount} H3 cell(s).`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        setUploadStatus(`Import failed: ${message}`);
      }
    },
    [mapReady, refreshDatasets, refreshMapState],
  );

  const handleDeleteDataset = useCallback(
    async (datasetId: string) => {
      const dataset = datasets.find((item) => item.id === datasetId);
      try {
        await geoDatasetService.deleteDataset(datasetId);
        mapService.removeLayer(dataset?.layerId || `${datasetId}-h3`);
        await refreshDatasets();
        refreshMapState();
        setUploadStatus(`Deleted ${dataset?.name || 'dataset'}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error';
        setUploadStatus(`Delete failed: ${message}`);
      }
    },
    [datasets, refreshDatasets, refreshMapState],
  );

  const handleRunPrompt = useCallback(
    async (prompt: string, history: ChatMessage[]): Promise<ChatRunOutput> => {
      if (!apiKey.trim()) {
        setStatus('Please provide an API key before running AI analysis.');
        return {
          finalAnswer: 'Please provide an API key before running AI analysis.',
          toolRuns: [],
        };
      }

      setStatus('Running tool-calling agent loop...');

      try {
        const schemaContext = await duckdbService.buildSchemaContextForPrompt(prompt);

        const result = await runAgentLoop({
          apiKey: apiKey.trim(),
          userPrompt: prompt,
          messageHistory: history,
          tools: TOOL_DEFINITIONS,
          schemaContext,
          executeTool: async (toolCall) => {
            const response = await toolExecutor.execute(toolCall);
            refreshMapState();
            return response;
          },
        });

        setLogs((prev) => [...prev, ...result.logs]);
        setStatus(`Done. ${result.finalAnswer}`);
        return {
          finalAnswer: result.finalAnswer,
          toolRuns: result.toolRuns,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'unexpected error';
        setStatus(`Agent failed: ${message}`);
        return {
          finalAnswer: `I hit an error while running tools: ${message}`,
          toolRuns: [],
        };
      }
    },
    [apiKey, refreshMapState],
  );

  const handleClearMap = useCallback(() => {
    mapService.clearMap();
    refreshMapState();
    setStatus('Map cleared.');
  }, [refreshMapState]);

  const handleBasemapChange = useCallback((preset: BasemapPreset) => {
    mapService.setBasemap(preset);
    refreshMapState();
    setStatus(`Basemap changed to ${preset}.`);
  }, [refreshMapState]);

  const handleOpacityChange = useCallback(
    (layerId: string, opacity: number) => {
      mapService.setLayerOpacity(layerId, opacity);
      refreshMapState();
    },
    [refreshMapState],
  );

  const handleLayerVisibility = useCallback(
    (layerId: string, visible: boolean) => {
      mapService.setLayerVisibility(layerId, visible);
      refreshMapState();
    },
    [refreshMapState],
  );

  const handleRemoveLayer = useCallback(
    (layerId: string) => {
      mapService.removeLayer(layerId);
      refreshMapState();
    },
    [refreshMapState],
  );

  return (
    <div className="app-container">
      <Sidebar
        status={status}
        apiKey={apiKey}
        onApiKeyChange={setApiKey}
        onRunPrompt={handleRunPrompt}
        onClearMap={handleClearMap}
        currentBasemap={currentBasemap}
        onBasemapChange={handleBasemapChange}
        logs={logs}
        layers={layers}
        onChangeLayerOpacity={handleOpacityChange}
        onToggleLayerVisibility={handleLayerVisibility}
        onRemoveLayer={handleRemoveLayer}
        onImportGeoJson={handleImportGeoJson}
        onDeleteDataset={handleDeleteDataset}
        datasets={datasets}
        uploadStatus={uploadStatus}
      />
      <div className="map-panel">
        <Map onReady={handleMapReady} />
      </div>
    </div>
  );
}

export default App;

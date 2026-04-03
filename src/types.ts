export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface GeoJSONGeometry {
  type: string;
  coordinates?: unknown;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: GeoJSONGeometry;
  properties: Record<string, unknown>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface ManagedLayer {
  id: string;
  colorBy: string;
  opacity: number;
  visible: boolean;
  featureCount: number;
  minValue: number;
  maxValue: number;
}

export interface ToolExecutionResult {
  success: boolean;
  message?: string;
  error?: string;
  geojson?: string;
  rowCount?: number;
  stats?: Record<string, { min: number; max: number; avg: number }>;
  data?: unknown;
}

export interface AgentRunResult {
  finalAnswer: string;
  messages: ChatMessage[];
  logs: string[];
  toolRuns: ToolRunTrace[];
}

export interface ToolRunTrace {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: ToolExecutionResult;
}

export interface ChatRunOutput {
  finalAnswer: string;
  toolRuns: ToolRunTrace[];
}

export interface LlmConfig {
  apiUrl: string;
  model: string;
  appTitle: string;
  referer: string;
  defaultApiKey: string;
  enablePromptCaching: boolean;
  promptCacheTtlSeconds: number;
  openRouterCacheControlHeader?: string;
}

export type BasemapPreset = 'osm' | 'dark' | 'positron';

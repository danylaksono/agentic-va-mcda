import type { LlmConfig } from './types';

export const llmConfig: LlmConfig = {
  apiUrl: import.meta.env.VITE_LLM_API_URL || 'https://openrouter.ai/api/v1/chat/completions',
  model: import.meta.env.VITE_LLM_MODEL || 'meta-llama/llama-3.3-70b-instruct',
  appTitle: import.meta.env.VITE_APP_TITLE || 'Urban Energy Decarb Explorer',
  referer: import.meta.env.VITE_APP_REFERER || 'http://localhost',
  defaultApiKey:
    import.meta.env.VITE_OPENROUTER_API_KEY ||
    (typeof __OPENROUTER_API_KEY__ !== 'undefined' ? __OPENROUTER_API_KEY__ : ''),
  enablePromptCaching: import.meta.env.VITE_ENABLE_PROMPT_CACHING === 'true',
  promptCacheTtlSeconds: Number(import.meta.env.VITE_PROMPT_CACHE_TTL_SECONDS || 300),
  openRouterCacheControlHeader: import.meta.env.VITE_OPENROUTER_CACHE_CONTROL,
};

export const defaultBasemapPreset =
  (import.meta.env.VITE_BASEMAP_PRESET as 'osm' | 'dark' | 'positron' | undefined) || 'osm';

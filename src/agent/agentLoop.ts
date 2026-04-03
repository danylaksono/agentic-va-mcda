import { llmConfig } from '../config';
import type {
  AgentRunResult,
  ChatMessage,
  ToolCall,
  ToolDefinition,
  ToolExecutionResult,
  ToolRunTrace,
} from '../types';

interface AgentLoopParams {
  apiKey: string;
  userPrompt: string;
  messageHistory: ChatMessage[];
  tools: ToolDefinition[];
  executeTool: (toolCall: ToolCall) => Promise<ToolExecutionResult>;
  schemaContext?: string;
  maxTurns?: number;
}

const BASE_SYSTEM_PROMPT = `You are an expert urban decarbonisation analyst with map and DuckDB tool access.
Prioritize H3 hexagonal analysis for city scale tasks.
Tool workflow:
1) If schema is unclear, call listTables first and then getTableSchema.
2) Use runH3SpatialQuery for data analysis queries.
3) Use addH3Layer to visualize resulting features.
4) Use flyTo, fitBounds, addMarker, addPopup for guidance and context.
5) Use setBasemap when user asks for dark / positron / osm map style.
6) Use clearMap or removeLayer for reset/remove requests.
Always produce concise plain-language final insights after tool use.
Avoid fabricating tool results.`;

function buildToolSummary(tools: ToolDefinition[]): string {
  const lines = tools.map(
    (tool) => `- ${tool.function.name}: ${tool.function.description}`,
  );
  return `Available tools:\n${lines.join('\n')}`;
}

async function fetchWithRetry(input: RequestInfo, init: RequestInit, retries = 2): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, init);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM API ${response.status}: ${body}`);
      }
      return response;
    } catch (error) {
      lastError = error as Error;
      if (attempt === retries) break;
    }
  }

  throw lastError ?? new Error('Unknown LLM API error');
}

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentRunResult> {
  const {
    apiKey,
    userPrompt,
    messageHistory,
    tools,
    executeTool,
    schemaContext,
    maxTurns = 8,
  } = params;

  const logs: string[] = [];
  const toolRuns: ToolRunTrace[] = [];
  const messages: ChatMessage[] = [
    ...messageHistory,
    {
      role: 'user',
      content: userPrompt,
    },
  ];

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const staticPrompt = [
      BASE_SYSTEM_PROMPT,
      buildToolSummary(tools),
      schemaContext ? `Relevant schema context:\n${schemaContext}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const staticSystemMessage: Record<string, unknown> = {
      role: 'system',
      content: staticPrompt,
    };

    if (llmConfig.enablePromptCaching) {
      staticSystemMessage.cache_control = {
        type: 'ephemeral',
        ttl_seconds: llmConfig.promptCacheTtlSeconds,
      };
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': llmConfig.referer,
      'X-OpenRouter-Title': llmConfig.appTitle,
    };

    if (llmConfig.openRouterCacheControlHeader) {
      headers['X-Cache-Control'] = llmConfig.openRouterCacheControlHeader;
    }

    const response = await fetchWithRetry(llmConfig.apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: llmConfig.model,
        messages: [
          staticSystemMessage,
          ...messages,
        ],
        tools,
        tool_choice: 'auto',
        temperature: 0.1,
      }),
    });

    const payload = await response.json();
    const assistant = payload?.choices?.[0]?.message as ChatMessage | undefined;

    if (!assistant) {
      throw new Error('LLM response did not include an assistant message.');
    }

    messages.push(assistant);

    const toolCalls = assistant.tool_calls;
    if (!toolCalls?.length) {
      return {
        finalAnswer: assistant.content || 'Analysis complete.',
        messages,
        logs,
        toolRuns,
      };
    }

    logs.push(
      `Turn ${turn + 1}: ${toolCalls.map((toolCall) => toolCall.function.name).join(', ')}`,
    );

    const toolResults = await Promise.all(
      toolCalls.map(async (toolCall) => {
        let args: Record<string, unknown> = {};
        try {
          args = toolCall.function.arguments
            ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          args = {};
        }

        const result = await executeTool(toolCall);
        toolRuns.push({
          id: toolCall.id,
          name: toolCall.function.name,
          args,
          result,
        });

        return {
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(result),
        };
      }),
    );

    messages.push(...toolResults);
  }

  return {
    finalAnswer: 'Stopped after max tool-calling turns. Try refining your query.',
    messages,
    logs,
    toolRuns,
  };
}

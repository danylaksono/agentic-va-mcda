import { useMemo } from 'react';
import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react';
import { Thread } from '@assistant-ui/react-ui';
import '@assistant-ui/react-ui/styles/index.css';
import type { ChatModelAdapter } from '@assistant-ui/react';
import type { ChatMessage, ChatRunOutput } from '../types';
import { ToolCallCard } from './ToolCallCard';

interface AssistantChatProps {
  onRunPrompt: (prompt: string, history: ChatMessage[]) => Promise<ChatRunOutput>;
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      toJsonValue(entryValue),
    ]);
    return Object.fromEntries(entries) as JsonObject;
  }
  return String(value);
}

function toJsonObject(value: unknown): JsonObject {
  const normalized = toJsonValue(value);
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized)) {
    return normalized as JsonObject;
  }
  return { value: normalized };
}

function extractTextContent(message: { content?: unknown }): string {
  const content = message.content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const typedPart = part as { type?: string; text?: string };
      if (typedPart.type === 'text') return typedPart.text || '';
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeHistory(messages: unknown[]): ChatMessage[] {
  return messages
    .map((rawMessage) => {
      if (!rawMessage || typeof rawMessage !== 'object') return null;
      const typedMessage = rawMessage as {
        role?: string;
        content?: unknown;
      };

      if (typedMessage.role !== 'user' && typedMessage.role !== 'assistant') return null;

      return {
        role: typedMessage.role,
        content: extractTextContent(typedMessage),
      } as ChatMessage;
    })
    .filter((message): message is ChatMessage => Boolean(message));
}

export default function AssistantChat({ onRunPrompt }: AssistantChatProps) {
  const chatModel = useMemo<ChatModelAdapter>(
    () => ({
      run: async (options) => {
        const normalized = normalizeHistory([...options.messages]);
        const userMessages = normalized.filter((message) => message.role === 'user');
        const prompt = userMessages[userMessages.length - 1]?.content || '';
        const history = normalized.slice(0, -1);

        const output = await onRunPrompt(prompt, history);
        const toolParts = output.toolRuns.map((toolRun) => ({
          type: 'tool-call' as const,
          toolCallId: toolRun.id,
          toolName: toolRun.name,
          args: toJsonObject(toolRun.args),
          argsText: JSON.stringify(toolRun.args),
          result: toolRun.result,
          isError: !toolRun.result.success,
        }));

        return {
          content: [
            ...toolParts,
            { type: 'text' as const, text: output.finalAnswer },
          ],
        };
      },
    }),
    [onRunPrompt],
  );

  const runtime = useLocalRuntime(chatModel, {
    maxSteps: 10,
  });

  return (
    <div className="assistant-thread-shell">
      <AssistantRuntimeProvider runtime={runtime}>
        <Thread
          assistantMessage={{
            components: {
              ToolFallback: ToolCallCard,
            },
          }}
          welcome={{
            message:
              'Ask anything about London energy decarbonisation. I can analyze with DuckDB + H3 and update the map.',
          }}
          strings={{
            composer: {
              input: {
                placeholder:
                  'Try: switch basemap to dark and show H3 cells with highest CO2 savings around central London',
              },
            },
          }}
        />
      </AssistantRuntimeProvider>
    </div>
  );
}

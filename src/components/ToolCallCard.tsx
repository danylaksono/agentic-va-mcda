import type { ToolCallMessagePartProps } from '@assistant-ui/react';

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ToolCallCard(props: ToolCallMessagePartProps) {
  const status = props.status?.type || 'complete';
  const isError = Boolean(props.isError);

  return (
    <div className={`tool-call-card ${isError ? 'error' : ''}`}>
      <div className="tool-call-header">
        <span className="tool-name">{props.toolName}</span>
        <span className={`tool-status ${status}`}>{status}</span>
      </div>

      <div className="tool-call-section">
        <div className="tool-label">Arguments</div>
        <pre>{formatJson(props.args)}</pre>
      </div>

      <div className="tool-call-section">
        <div className="tool-label">Result</div>
        <pre>{formatJson(props.result ?? {})}</pre>
      </div>
    </div>
  );
}

export default ToolCallCard;

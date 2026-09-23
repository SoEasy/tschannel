import { Component, createSignal, For, onMount, onCleanup } from 'solid-js';
import { LogService, type TLogMessage } from '../middlewares/log/log.service';

type TLogEntry = TLogMessage & {
  id: number;
  timestamp: Date;
};

type Props = {
  logService: LogService;
};

const Log: Component<Props> = (props) => {
  const [logs, setLogs] = createSignal<TLogEntry[]>([]);
  let logId = 0;

  onMount(() => {
    const unsubscribe = props.logService.subscribe((message) => {
      setLogs((prev) => [
        {
          ...message,
          id: logId++,
          timestamp: new Date(),
        },
        ...prev,
      ]);
    });

    onCleanup(() => {
      unsubscribe();
    });
  });

  const clearLogs = () => setLogs([]);

  return (
    <div class="logs-section">
      <div class="logs-header">
        <h2>Communication Log</h2>
        <button onClick={clearLogs}>Clear</button>
      </div>
      <div class="logs">
        <For each={logs()}>
          {(log) => (
            <div class={`log-entry ${log.side.toLowerCase()} ${log.type}`}>
              <span class="log-time">{log.timestamp.toLocaleTimeString()}</span>
              <span class="log-side">{log.side}</span>
              <span class={`log-type ${log.type}`}>{log.type === 'sent' ? 'í' : 'ê'}</span>
              <span class="log-message">{log.message}</span>
            </div>
          )}
        </For>
        {logs().length === 0 && (
          <div class="empty-state">No messages yet. Try sending something!</div>
        )}
      </div>
    </div>
  );
};

export default Log;

import { describe, expect, it, vi } from 'vitest';
import { MiddlewarePipeline } from '../../src/bridge/middleware';
import type { TDispatchTrace } from '../../src/bridge/contracts';

describe('MiddlewarePipeline', () => {
  it('runs each transformation stage in registration order', async () => {
    const pipeline = new MiddlewarePipeline('example', 'main');
    const stages: string[] = [];
    pipeline.use({
      onBeforeSend: (_namespace, _name, value) => {
        stages.push('first-send');
        return `${String(value)}-a`;
      },
      onBeforeHandle: (_namespace, _name, value) => {
        stages.push('first-handle');
        return `${String(value)}-c`;
      },
      onAfterHandle: (_namespace, _name, value) => {
        stages.push('first-after-handle');
        return `${String(value)}-e`;
      },
      onAfterReceive: (_namespace, _name, value) => {
        stages.push('first-receive');
        return `${String(value)}-g`;
      },
    });
    pipeline.use({
      onBeforeSend: (_namespace, _name, value) => {
        stages.push('second-send');
        return `${String(value)}-b`;
      },
      onBeforeHandle: (_namespace, _name, value) => {
        stages.push('second-handle');
        return `${String(value)}-d`;
      },
      onAfterHandle: (_namespace, _name, value) => {
        stages.push('second-after-handle');
        return `${String(value)}-f`;
      },
      onAfterReceive: (_namespace, _name, value) => {
        stages.push('second-receive');
        return `${String(value)}-h`;
      },
    });

    const sent = await pipeline.beforeSend('ping', 'input');
    const handled = await pipeline.beforeHandle('ping', sent);
    const afterHandle = await pipeline.afterHandle('ping', handled);
    const received = await pipeline.afterReceive('ping', afterHandle);

    expect(received).toBe('input-a-b-c-d-e-f-g-h');
    expect(stages).toEqual([
      'first-send',
      'second-send',
      'first-handle',
      'second-handle',
      'first-after-handle',
      'second-after-handle',
      'first-receive',
      'second-receive',
    ]);
  });

  it('reports one terminal failure and synchronously runs error hooks', async () => {
    const pipeline = new MiddlewarePipeline('example', 'worker');
    const error = new Error('failed');
    const onError = vi.fn();
    const observe = vi.fn();
    pipeline.use({ onError, observe });
    const trace: TDispatchTrace = {
      id: 'request-1',
      name: 'ping',
      kind: 'request',
      value: 'input',
      failedAt: 'handler',
      isFailed: false,
      isCompleted: false,
    };

    pipeline.failApplication(trace, error);
    pipeline.failApplication(trace, error);
    pipeline.reportError('ping', error);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith('example', 'ping', error);
    await Promise.resolve();
    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'request-1', failedAt: 'handler', error }),
      'failed'
    );
  });

  it('isolates observers from control-frame mutation and observer failure', async () => {
    const pipeline = new MiddlewarePipeline('example', 'main');
    const second = vi.fn();
    pipeline.use({
      observe: (view) => {
        try {
          (view as { type?: string }).type = 'changed';
        } catch {
          // Frozen views reject mutation in strict mode.
        }
        throw new Error('observer failed');
      },
    });
    pipeline.use({ observe: second });
    const control = {
      family: 'control' as const,
      type: 'hello' as const,
      protocolVersion: 1 as const,
      namespace: 'example',
      endpointId: 'peer',
      sender: 'worker' as const,
    };

    pipeline.observeControl(control, 'controlReceived');
    await Promise.resolve();
    expect(control.type).toBe('hello');
    expect(second).toHaveBeenCalledWith(expect.objectContaining({ kind: 'hello' }), 'controlReceived');
  });
});

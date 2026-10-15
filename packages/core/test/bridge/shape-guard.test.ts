import { describe, expect, it } from 'vitest';
import { MessageShapeGuard } from '../../src/bridge/shape-guard';

const base = { namespace: 'example', endpointId: 'peer', sender: 'worker' };
const application = {
  family: 'application',
  id: 'request-1',
  name: 'ping',
  namespace: 'example',
  endpointId: 'peer',
  targetEndpointId: 'local',
  sessionId: 'session-1',
  sender: 'worker',
};

describe('MessageShapeGuard', () => {
  const guard = new MessageShapeGuard();

  it('accepts known control shapes without imposing the local protocol version', () => {
    expect(guard.isCorrectShape({ ...base, family: 'control', type: 'hello', protocolVersion: 99 })).toBe(true);
    expect(
      guard.isCorrectShape({
        ...base,
        family: 'control',
        type: 'select',
        sender: 'main',
        protocolVersion: 1,
        targetEndpointId: 'local',
        sessionId: 'session-1',
      })
    ).toBe(true);
    expect(
      guard.isCorrectShape({
        ...base,
        family: 'control',
        type: 'connected',
        protocolVersion: 1,
        targetEndpointId: 'local',
        sessionId: 'session-1',
      })
    ).toBe(true);
    expect(
      guard.isCorrectShape({
        ...base,
        family: 'control',
        type: 'reject',
        protocolVersion: 1,
        targetEndpointId: 'local',
        reason: 'busy',
      })
    ).toBe(true);
  });

  it('accepts application payload fields without checking session ownership or payload schemas', () => {
    expect(guard.isCorrectShape({ ...application, type: 'request', data: null })).toBe(true);
    expect(guard.isCorrectShape({ ...application, type: 'response', sessionId: 'foreign', data: { x: 1 } })).toBe(true);
    expect(guard.isCorrectShape({ ...application, type: 'error', error: 42 })).toBe(true);
  });

  it('rejects unknown, malformed, and incomplete frames', () => {
    expect(guard.isCorrectShape(null)).toBe(false);
    expect(guard.isCorrectShape({ ...base, family: 'control', type: 'unknown', protocolVersion: 1 })).toBe(false);
    expect(
      guard.isCorrectShape({
        ...base,
        family: 'control',
        type: 'select',
        protocolVersion: 1,
        targetEndpointId: 'local',
      })
    ).toBe(false);
    expect(guard.isCorrectShape({ ...application, type: 'response' })).toBe(false);
    expect(guard.isCorrectShape({ ...application, type: 'request', data: 1, sessionId: '' })).toBe(false);
    expect(guard.isCorrectShape({ ...application, type: 'error', error: 'bad', family: 'other' })).toBe(false);
  });
});

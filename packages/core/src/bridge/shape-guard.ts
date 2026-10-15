/**
 * Checks incoming message structure before protocol or application processing.
 * Version compatibility, namespace, and session ownership belong to the session.
 */
import type { TApplicationMessage, TBridgeSide, THandshakeRejectReason } from '../types';
import type { IMessageShapeGuard, TIncomingHandshakeMessage, TWellFormedShape } from './contracts';

/** Record known to be in the control family before its variant is checked. */
type TControlMessage = Record<string, unknown> & {
  /** Routes the value through handshake validation. */
  family: 'control';
};
/** Fields common to all application variants before payload validation. */
type TApplicationMessageBase = Record<string, unknown> & {
  /** Routes the value through application validation. */
  family: 'application';

  /** Request correlation ID. */
  id: string;

  /** Name of the application operation. */
  name: string;

  /** Namespace carried by the frame. */
  namespace: string;

  /** Sender endpoint identity. */
  endpointId: string;

  /** Intended recipient endpoint identity. */
  targetEndpointId: string;

  /** Selected protocol session identity. */
  sessionId: string;

  /** Side claimed by the sender. */
  sender: TBridgeSide;
};

/** Accepts non-null records before reading discriminator fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Requires an identifier field to contain at least one character. */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** Accepts the two protocol sides without assigning session ownership. */
function isBridgeSide(value: unknown): value is TBridgeSide {
  return value === 'main' || value === 'worker';
}

/** Accepts only rejection reasons defined by the wire protocol. */
function isHandshakeRejectReason(value: unknown): value is THandshakeRejectReason {
  return value === 'incompatible-version' || value === 'busy' || value === 'invalid-selection';
}

/** Narrows a record to the control family before variant checks. */
function isControlMessage(message: unknown): message is TControlMessage {
  return isRecord(message) && message.family === 'control';
}

/** Checks fields shared by all control variants, including numeric version. */
function hasHandshakeBase(message: TControlMessage): boolean {
  return (
    typeof message.protocolVersion === 'number' &&
    isNonEmptyString(message.namespace) &&
    isNonEmptyString(message.endpointId) &&
    isBridgeSide(message.sender)
  );
}

/** Checks the recipient field required by addressed control frames. */
function hasHandshakeAddress(message: Record<string, unknown>): boolean {
  return isNonEmptyString(message.targetEndpointId);
}

/** Variant-specific checks after the common control fields are valid. */
const HANDSHAKE_MESSAGE_VALIDATORS: Record<string, (message: Record<string, unknown>) => boolean> = {
  /** HELLO has no addressed-session fields. */
  hello: () => true,
  /** Only main can select a specific worker and session. */
  select: (message) => message.sender === 'main' && hasHandshakeAddress(message) && isNonEmptyString(message.sessionId),
  /** Only worker can confirm an addressed selection. */
  connected: (message) =>
    message.sender === 'worker' && hasHandshakeAddress(message) && isNonEmptyString(message.sessionId),
  /** Rejection names an addressed peer and a known reason. */
  reject: (message) => hasHandshakeAddress(message) && isHandshakeRejectReason(message.reason),
};

/** Narrows a known control variant while leaving version compatibility open. */
function isHandshakeMessage(message: unknown): message is TIncomingHandshakeMessage {
  if (!isControlMessage(message) || !hasHandshakeBase(message) || typeof message.type !== 'string') {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(HANDSHAKE_MESSAGE_VALIDATORS, message.type)) {
    return false;
  }
  const validateMessage = HANDSHAKE_MESSAGE_VALIDATORS[message.type];
  return validateMessage(message);
}

/** Checks session-routing identifiers common to application variants. */
function hasApplicationBase(message: Record<string, unknown>): message is TApplicationMessageBase {
  const identifiers = [message.id, message.namespace, message.endpointId, message.targetEndpointId, message.sessionId];
  return (
    message.family === 'application' &&
    identifiers.every(isNonEmptyString) &&
    typeof message.name === 'string' &&
    isBridgeSide(message.sender)
  );
}

/** Requires payload presence for requests/responses and error presence for failures. */
function isApplicationMessage(message: unknown): message is TApplicationMessage {
  if (!isRecord(message) || !hasApplicationBase(message)) {
    return false;
  }
  if (message.type === 'request' || message.type === 'response') {
    return Object.prototype.hasOwnProperty.call(message, 'data');
  }
  return message.type === 'error' && Object.prototype.hasOwnProperty.call(message, 'error');
}

/** Separates structural validity from protocol admission. */
export class MessageShapeGuard implements IMessageShapeGuard {
  /** Accepts only known complete frame shapes; session decides whether to use them. */
  isCorrectShape(value: unknown): value is TWellFormedShape {
    if (isControlMessage(value)) {
      return isHandshakeMessage(value);
    }
    return isApplicationMessage(value);
  }
}

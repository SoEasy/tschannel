/**
 * Negotiates one peer session and owns protocol readiness and handshake timers.
 * The Bridge supplies channel send and readiness ports; application requests remain in messaging.
 */
import {
  type TApplicationMessage,
  type TBridgeSide,
  type TEndpointId,
  type THandshakeConnected,
  type THandshakeHello,
  type THandshakeMessage,
  type THandshakeRejectReason,
  type THandshakeSelect,
  TSCHANNEL_PROTOCOL_VERSION,
  type TSessionId,
} from '../types';
import { generateMessageId } from '../utils';
import {
  BRIDGE_ERRORS,
  type IMiddlewarePipeline,
  type IProtocolSession,
  type TIncomingHandshakeConnected,
  type TIncomingHandshakeHello,
  type TIncomingHandshakeMessage,
  type TIncomingHandshakeSelect,
  type TSessionSnapshot,
  type TTimeout,
  toError,
} from './contracts';

/** Narrow ports and settings supplied by the Bridge facade. */
type TSessionOptions = {
  /** Namespace accepted during negotiation. */
  namespace: string;

  /** Local protocol role. */
  side: TBridgeSide;

  /** Handshake deadline and addressed SELECT retry delay in milliseconds. */
  handshake: {
    /** Maximum time allowed for readiness. */
    timeout: number;

    /** Delay before resending an unconfirmed selection. */
    retryInterval: number;
  };

  /** Reports whether the local transport can submit control frames. */
  isChannelReady(): boolean;

  /** Sends one control frame through the channel owned by Bridge. */
  send(message: THandshakeMessage): void;

  /** Reports protocol phases without controlling negotiation. */
  middleware: IMiddlewarePipeline;
};

/** Resolves the peer role expected for incoming frames. */
function getComplementarySide(side: TBridgeSide): TBridgeSide {
  return side === 'main' ? 'worker' : 'main';
}

/** Negotiates one peer and owns all protocol readiness state. */
export class ProtocolSession implements IProtocolSession {
  /** Stable local identity used to address this Bridge instance. */
  private readonly endpointId: TEndpointId;

  /** Shared result awaited by dispatches and public ready() callers. */
  private readonly readinessPromise: Promise<void>;

  /** Settles readiness after a confirmed selection. */
  private resolveReadiness: () => void = () => undefined;

  /** Settles readiness after a terminal protocol or channel failure. */
  private rejectReadiness: (error: Error) => void = () => undefined;

  /** Prevents readiness from being resolved or rejected twice. */
  private isReadinessSettled = false;

  /** Records acknowledged session readiness, separate from channel readiness. */
  private isProtocolReady = false;

  /** Prevents duplicate timeout and initial HELLO setup. */
  private isStarted = false;

  /** Makes late control frames and timer callbacks inert. */
  private isDestroyed = false;

  /** Identity of the single peer selected for this session. */
  private peerEndpointId: TEndpointId | null = null;

  /** Shared identity required on application frames. */
  private sessionId: TSessionId | null = null;

  /** Deadline for the entire handshake. */
  private handshakeTimeout: TTimeout | null = null;

  /** Timer for resending SELECT until CONNECTED arrives. */
  private selectionRetryTimeout: TTimeout | null = null;

  /** Creates local endpoint identity and a single shared readiness promise. */
  constructor(
    /** Port dependencies and timing policy supplied by the facade. */
    private readonly options: TSessionOptions
  ) {
    this.endpointId = generateMessageId(`${options.namespace}_${options.side}_endpoint`);
    this.readinessPromise = new Promise<void>((resolve, reject) => {
      this.resolveReadiness = resolve;
      this.rejectReadiness = reject;
    });
    void this.readinessPromise.catch(() => undefined);
  }

  /** Returns the stable sender ID for outbound control and application frames. */
  localEndpointId(): TEndpointId {
    return this.endpointId;
  }

  /** Starts the deadline and initial HELLO after channel initialization. */
  start(): void {
    if (this.isStarted || this.isDestroyed) {
      return;
    }
    this.isStarted = true;
    this.handshakeTimeout = setTimeout(() => {
      this.fail(new Error(BRIDGE_ERRORS.HANDSHAKE_TIMEOUT));
    }, this.options.handshake.timeout);
    this.sendHello();
  }

  /** Routes an eligible control frame to its protocol transition. */
  accept(message: TIncomingHandshakeMessage): void {
    if (!this.canAccept(message)) {
      return;
    }
    this.options.middleware.observeControl(message, 'controlReceived');
    if (this.handleIncompatibleHandshakeMessage(message)) {
      return;
    }

    if (message.type === 'hello') {
      this.handleHello(message);
    } else if (message.type === 'select') {
      this.handleSelect(message);
    } else if (message.type === 'connected') {
      this.handleConnected(message);
    } else {
      this.fail(new Error(BRIDGE_ERRORS.HANDSHAKE_REJECTED(message.reason)));
    }
  }

  /** Rejects late, foreign, self-sent, and incorrectly addressed frames. */
  private canAccept(message: TIncomingHandshakeMessage): boolean {
    return !(
      !this.isStarted ||
      this.isDestroyed ||
      this.hasReadinessFailed() ||
      message.namespace !== this.options.namespace ||
      message.endpointId === this.endpointId ||
      message.sender === this.options.side ||
      ('targetEndpointId' in message && message.targetEndpointId !== this.endpointId)
    );
  }

  /** Admits only frames for the ready session and selected peer. */
  admits(message: TApplicationMessage): boolean {
    return (
      this.isReady() &&
      message.namespace === this.options.namespace &&
      message.sessionId === this.sessionId &&
      message.endpointId === this.peerEndpointId &&
      message.targetEndpointId === this.endpointId &&
      message.sender === getComplementarySide(this.options.side)
    );
  }

  /** Returns a frozen snapshot only while the selected session is ready. */
  current(): TSessionSnapshot | null {
    if (!this.isReady() || !this.peerEndpointId || !this.sessionId) {
      return null;
    }
    return Object.freeze({
      endpointId: this.endpointId,
      peerEndpointId: this.peerEndpointId,
      sessionId: this.sessionId,
      namespace: this.options.namespace,
      side: this.options.side,
    });
  }

  /** Shares the negotiation result or rejects immediately after destruction. */
  ready(): Promise<void> {
    if (this.isDestroyed) {
      return Promise.reject(new Error(BRIDGE_ERRORS.BRIDGE_DESTROYED));
    }
    return this.readinessPromise;
  }

  /** Reports acknowledged protocol readiness. */
  isReady(): boolean {
    return this.isProtocolReady && !this.isDestroyed;
  }

  /** Distinguishes a terminal failure from negotiation still in progress. */
  hasReadinessFailed(): boolean {
    return this.isReadinessSettled && !this.isProtocolReady;
  }

  /** Rejects readiness once and stops handshake timers. */
  fail(error: Error): void {
    if (this.isReadinessSettled) {
      return;
    }
    this.options.middleware.observeControlFailure(this.endpointId, error);
    this.isReadinessSettled = true;
    this.isProtocolReady = false;
    this.clearHandshakeTimers();
    this.rejectReadiness(error);
  }

  /** Prevents future negotiation and cancels all protocol timers. */
  destroy(error: Error): void {
    if (this.isDestroyed) {
      return;
    }
    this.isDestroyed = true;
    this.isProtocolReady = false;
    this.clearHandshakeTimers();
    this.fail(error);
  }

  /** Rejects unsupported addressed frames while ignoring incompatible HELLO. */
  private handleIncompatibleHandshakeMessage(message: TIncomingHandshakeMessage): boolean {
    if (message.protocolVersion === TSCHANNEL_PROTOCOL_VERSION) {
      return false;
    }
    if (message.type !== 'hello') {
      if (message.type !== 'reject') {
        this.sendReject(message.endpointId, 'incompatible-version');
      }
      this.fail(new Error(BRIDGE_ERRORS.INCOMPATIBLE_PROTOCOL(message.protocolVersion)));
    }
    return true;
  }

  /** Replies symmetrically and lets main select the first eligible worker. */
  private handleHello(message: TIncomingHandshakeHello): void {
    if (this.isProtocolReady || message.sender !== getComplementarySide(this.options.side)) {
      return;
    }
    if (this.options.side === 'worker') {
      this.sendHello();
      return;
    }
    if (message.sender === 'worker' && !this.peerEndpointId) {
      this.peerEndpointId = message.endpointId;
      this.sessionId = generateMessageId(`${this.options.namespace}_session`);
      this.scheduleSelectionRetry();
      this.sendSelect();
    }
  }

  /** Confirms the first valid selection or rejects a competing session. */
  private handleSelect(message: TIncomingHandshakeSelect): void {
    if (this.options.side !== 'worker' || message.sender !== 'main') {
      this.sendReject(message.endpointId, 'invalid-selection');
      return;
    }
    if (!this.peerEndpointId && !this.sessionId) {
      this.peerEndpointId = message.endpointId;
      this.sessionId = message.sessionId;
      this.sendConnected();
      this.completeReadiness();
      return;
    }
    if (this.peerEndpointId === message.endpointId && this.sessionId === message.sessionId) {
      this.sendConnected();
      return;
    }
    this.sendReject(message.endpointId, 'busy');
  }

  /** Completes main-side readiness for the selected worker and session. */
  private handleConnected(message: TIncomingHandshakeConnected): void {
    if (
      this.options.side !== 'main' ||
      message.sender !== 'worker' ||
      message.endpointId !== this.peerEndpointId ||
      message.sessionId !== this.sessionId
    ) {
      return;
    }
    this.completeReadiness();
  }

  /** Announces this endpoint only while the local transport is usable. */
  private sendHello(): void {
    if (this.isDestroyed || this.isProtocolReady || this.hasReadinessFailed() || !this.options.isChannelReady()) {
      return;
    }
    const message: THandshakeHello = {
      family: 'control',
      type: 'hello',
      protocolVersion: TSCHANNEL_PROTOCOL_VERSION,
      namespace: this.options.namespace,
      endpointId: this.endpointId,
      sender: this.options.side,
    };
    this.sendProtocolMessage(message);
  }

  /** Sends main's current addressed peer and session selection. */
  private sendSelect(): void {
    if (!this.peerEndpointId || !this.sessionId || this.options.side !== 'main') {
      return;
    }
    const message: THandshakeSelect = {
      family: 'control',
      type: 'select',
      protocolVersion: TSCHANNEL_PROTOCOL_VERSION,
      namespace: this.options.namespace,
      endpointId: this.endpointId,
      targetEndpointId: this.peerEndpointId,
      sender: 'main',
      sessionId: this.sessionId,
    };
    this.sendProtocolMessage(message);
  }

  /** Confirms worker acceptance of the addressed selection. */
  private sendConnected(): void {
    if (!this.peerEndpointId || !this.sessionId || this.options.side !== 'worker') {
      return;
    }
    const message: THandshakeConnected = {
      family: 'control',
      type: 'connected',
      protocolVersion: TSCHANNEL_PROTOCOL_VERSION,
      namespace: this.options.namespace,
      endpointId: this.endpointId,
      targetEndpointId: this.peerEndpointId,
      sender: 'worker',
      sessionId: this.sessionId,
    };
    this.sendProtocolMessage(message);
  }

  /** Sends an addressed protocol rejection when the channel can send. */
  private sendReject(targetEndpointId: TEndpointId, reason: THandshakeRejectReason): void {
    if (!this.options.isChannelReady() || this.isDestroyed) {
      return;
    }
    this.sendProtocolMessage({
      family: 'control',
      type: 'reject',
      protocolVersion: TSCHANNEL_PROTOCOL_VERSION,
      namespace: this.options.namespace,
      endpointId: this.endpointId,
      targetEndpointId,
      sender: this.options.side,
      reason,
    });
  }

  /** Observes and submits a control frame, converting send failures to readiness failure. */
  private sendProtocolMessage(message: THandshakeMessage): void {
    try {
      this.options.middleware.observeControl(message, 'controlSent');
      this.options.send(message);
    } catch (error) {
      this.fail(toError(error));
    }
  }

  /** Retries the same selection until confirmation or terminal state. */
  private scheduleSelectionRetry(): void {
    this.clearSelectionRetry();
    this.selectionRetryTimeout = setTimeout(() => {
      if (this.isDestroyed || this.isProtocolReady || this.hasReadinessFailed() || !this.peerEndpointId) {
        return;
      }
      this.scheduleSelectionRetry();
      this.sendSelect();
    }, this.options.handshake.retryInterval);
  }

  /** Resolves the shared readiness promise exactly once. */
  private completeReadiness(): void {
    if (this.isReadinessSettled || this.isDestroyed) {
      return;
    }
    this.isReadinessSettled = true;
    this.isProtocolReady = true;
    this.clearHandshakeTimers();
    this.resolveReadiness();
  }

  /** Stops the global deadline and any outstanding selection retry. */
  private clearHandshakeTimers(): void {
    if (this.handshakeTimeout) {
      clearTimeout(this.handshakeTimeout);
      this.handshakeTimeout = null;
    }
    this.clearSelectionRetry();
  }

  /** Cancels only the addressed SELECT retry timer. */
  private clearSelectionRetry(): void {
    if (this.selectionRetryTimeout) {
      clearTimeout(this.selectionRetryTimeout);
      this.selectionRetryTimeout = null;
    }
  }
}

export type TLogMessage = {
  side: 'Main' | 'Worker';
  type: 'sent' | 'received';
  message: string;
};

export type TListener = (message: TLogMessage) => void;
export type TUnsubscribeFn = VoidFunction;

export class LogService {
  private listeners: Array<TListener> = [];

  subscribe = (listener: TListener): TUnsubscribeFn => {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  };

  addMessage = (message: TLogMessage): void => {
    this.listeners.forEach((l) => l(message));
  };

  destroy = (): void => {
    this.listeners = [];
  };
}

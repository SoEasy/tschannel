import type { TMessageDirection, TMessageObjectType } from './types';

type TMessageMeta = {
  direction: TMessageDirection;
  type: TMessageObjectType;
};

type TMessageDefinition<TRequest = unknown, TResponse = unknown> = {
  request: TRequest;
  response: TResponse;
  meta: TMessageMeta;
};

type TMessagesMap = { [key: string]: TMessageDefinition };

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- {} used as empty default for generic type parameter
export class NamespaceBuilder<TNamespaceName extends string, TMessages extends TMessagesMap = {}> {
  private messages: Array<{ name: string; direction: TMessageDirection }> = [];

  constructor(private namespaceName: TNamespaceName) {}

  /**
   * Defines a message that can only be sent from main to worker.
   * The only way to combine passed generics and type inference is function chaining.
   */
  mainToWorkerMessage<TReq, TRes>(): <TMessageName extends string>(
    messageName: TMessageName
  ) => NamespaceBuilder<
    TNamespaceName,
    TMessages & {
      [key in TMessageName]: {
        request: TReq;
        response: TRes;
        meta: { direction: 'mainToWorker'; type: TMessageObjectType };
      };
    }
  > {
    return <TMessageName extends string>(
      messageName: TMessageName
    ): NamespaceBuilder<
      TNamespaceName,
      TMessages & {
        [key in TMessageName]: {
          request: TReq;
          response: TRes;
          meta: { direction: 'mainToWorker'; type: TMessageObjectType };
        };
      }
    > => {
      this.messages.push({ name: messageName, direction: 'mainToWorker' });
      return this as NamespaceBuilder<
        TNamespaceName,
        TMessages &
          Record<
            TMessageName,
            {
              request: TReq;
              response: TRes;
              meta: { direction: 'mainToWorker'; type: TMessageObjectType };
            }
          >
      >;
    };
  }

  /**
   * Defines a message that can only be sent from worker to main.
   * The only way to combine passed generics and type inference is function chaining.
   */
  workerToMainMessage<TReq, TRes>(): <TMessageName extends string>(
    messageName: TMessageName
  ) => NamespaceBuilder<
    TNamespaceName,
    TMessages & {
      [key in TMessageName]: {
        request: TReq;
        response: TRes;
        meta: { direction: 'workerToMain'; type: TMessageObjectType };
      };
    }
  > {
    return <TMessageName extends string>(
      messageName: TMessageName
    ): NamespaceBuilder<
      TNamespaceName,
      TMessages & {
        [key in TMessageName]: {
          request: TReq;
          response: TRes;
          meta: { direction: 'workerToMain'; type: TMessageObjectType };
        };
      }
    > => {
      this.messages.push({ name: messageName, direction: 'workerToMain' });
      return this as NamespaceBuilder<
        TNamespaceName,
        TMessages &
          Record<
            TMessageName,
            {
              request: TReq;
              response: TRes;
              meta: { direction: 'workerToMain'; type: TMessageObjectType };
            }
          >
      >;
    };
  }

  /**
   * Defines a message that can be sent in both directions (main ↔ worker).
   * The only way to combine passed generics and type inference is function chaining.
   */
  bidirectionalMessage<TReq, TRes>(): <TMessageName extends string>(
    messageName: TMessageName
  ) => NamespaceBuilder<
    TNamespaceName,
    TMessages & {
      [key in TMessageName]: {
        request: TReq;
        response: TRes;
        meta: { direction: 'bidirectional'; type: TMessageObjectType };
      };
    }
  > {
    return <TMessageName extends string>(
      messageName: TMessageName
    ): NamespaceBuilder<
      TNamespaceName,
      TMessages & {
        [key in TMessageName]: {
          request: TReq;
          response: TRes;
          meta: { direction: 'bidirectional'; type: TMessageObjectType };
        };
      }
    > => {
      this.messages.push({ name: messageName, direction: 'bidirectional' });
      return this as NamespaceBuilder<
        TNamespaceName,
        TMessages &
          Record<
            TMessageName,
            {
              request: TReq;
              response: TRes;
              meta: { direction: 'bidirectional'; type: TMessageObjectType };
            }
          >
      >;
    };
  }

  build(): NamespaceMessages<TNamespaceName, TMessages> {
    return new NamespaceMessages<TNamespaceName, TMessages>(this.namespaceName, this.messages);
  }
}

export type TMessageBase<TNamespaceName extends string, TMessageName extends string> = {
  namespace: TNamespaceName;
  name: TMessageName;
  meta: TMessageMeta;
};

export type TMessageToListen<
  TNamespaceName extends string,
  TMessageName extends string,
  // For restrictions in .listen typings
  TDirection extends TMessageDirection = 'mainToWorker',
> = Readonly<
  TMessageBase<TNamespaceName, TMessageName> & {
    meta: {
      direction: TDirection;
      type: 'forListen';
    };
  }
>;

export type TMessageToSend<
  TNamespaceName extends string,
  TMessageName extends string,
  TRequest = unknown,
  // For restrictions in .send typings
  TDirection extends TMessageDirection = 'mainToWorker',
> = Readonly<
  TMessageBase<TNamespaceName, TMessageName> & {
    payload: TRequest;
    meta: {
      direction: TDirection;
      type: 'forSend';
    };
  }
>;

type TSendMethods<TNamespaceName extends string, TMessages extends TMessagesMap> = {
  [K in keyof TMessages]: (
    payload: TMessages[K]['request']
  ) => K extends string
    ? TMessageToSend<TNamespaceName, K, TMessages[K]['request'], TMessages[K]['meta']['direction']>
    : never;
};

type TMessageIdentifiers<TNamespaceName extends string, TMessages extends TMessagesMap> = {
  [K in keyof TMessages]: K extends string
    ? TMessageToListen<TNamespaceName, K, TMessages[K]['meta']['direction']>
    : never;
};

export class NamespaceMessages<
  TNamespaceName extends string = string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  TMessages extends { [messageName: string]: TMessageDefinition } = any,
> {
  private messageObjectCache?: TMessageIdentifiers<TNamespaceName, TMessages>;
  private sendObjectCache?: TSendMethods<TNamespaceName, TMessages>;

  constructor(
    public namespaceName: TNamespaceName,
    public messages: Array<{ name: string; direction: TMessageDirection }>
  ) {}

  get message(): TMessageIdentifiers<TNamespaceName, TMessages> {
    if (!this.messageObjectCache) {
      this.messageObjectCache = this.messages.reduce(
        (acc: TMessageIdentifiers<TNamespaceName, TMessages>, message) => ({
          ...acc,
          [message.name]: {
            namespace: this.namespaceName,
            name: message.name,
            meta: {
              direction: message.direction,
              type: 'forListen',
            },
          },
        }),
        {} as TMessageIdentifiers<TNamespaceName, TMessages>
      );
    }
    return this.messageObjectCache;
  }

  get send(): TSendMethods<TNamespaceName, TMessages> {
    if (!this.sendObjectCache) {
      this.sendObjectCache = this.messages.reduce(
        (
          acc: TSendMethods<TNamespaceName, TMessages>,
          message
        ): TSendMethods<TNamespaceName, TMessages> => ({
          ...acc,
          [message.name]: (payload: TMessages[typeof message.name]['request']) => ({
            namespace: this.namespaceName,
            name: message.name,
            payload,
            meta: {
              direction: message.direction,
              type: 'forSend',
            },
          }),
        }),
        {} as TSendMethods<TNamespaceName, TMessages>
      );
    }
    return this.sendObjectCache;
  }
}

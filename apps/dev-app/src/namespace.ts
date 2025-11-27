import { NamespaceBuilder } from '@tschannel/core';

// Define message types
type TUser = {
  id: string;
  name: string;
  email: string;
};

// Create namespace with different message directions
export const demoNamespace = new NamespaceBuilder('demo')
  // Main → Worker messages (commands from parent to child)
  .mainToWorkerMessage<void, string>()('init')
  .mainToWorkerMessage<string, string>()('sendText')
  .mainToWorkerMessage<number, number>()('calculateSquare')
  .mainToWorkerMessage<{ id: string }, TUser>()('getUserData')

  // Worker → Main messages (events from child to parent)
  .workerToMainMessage<string, void>()('notifyParent')
  .workerToMainMessage<{ level: string; message: string }, void>()('logToParent')

  // Bidirectional messages (can be sent from either side)
  .bidirectionalMessage<void, string>()('ping')
  .bidirectionalMessage<string, string>()('echo')
  .build();

// Export message types for convenience
export const messages = demoNamespace.message;
export const send = demoNamespace.send;

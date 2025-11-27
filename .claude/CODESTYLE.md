# Coding Conventions for tschannel

This document defines coding standards and best practices for TypeScript code in the tschannel project.

## General Principles

- **Shared codebase**: Code is not divided into "mine/yours" - it's shared and everyone is responsible
- **No duplication**: Before creating a component/utility, check if it already exists in the project
- **Refactor legacy code**: When modifying legacy code, allocate time for refactoring
- **Self-review PRs**: Review your own PR before requesting review to save reviewers' time
- **Clear names over comments**: Well-named variables/functions can eliminate the need for comments

---

## Naming Conventions

### Variables and Functions

- **Variables and functions**: Use `camelCase`

  ```typescript
  const userName = 'john';
  const userAge = 25;

  function getUserData() {}
  function calculateTotal() {}
  ```

- **Classes**: Use `PascalCase`

  ```typescript
  class UserManager {}
  class HttpClient {}
  class Bridge {}
  ```

- **Global constants**: Use `UPPER_SNAKE_CASE`

  ```typescript
  const MAX_RETRY_COUNT = 3;
  const DEFAULT_TIMEOUT = 5000;
  const API_BASE_URL = 'https://api.example.com';
  ```

- **Local constants** (inside functions): Use `camelCase`
  ```typescript
  function processData() {
    const maxItems = 100; // Not MAX_ITEMS
    const itemCount = data.length;
  }
  ```

### Boolean Variables

- **Singular**: Start with `has` or `is`

  ```typescript
  const hasError = false;
  const isLoading = true;
  const isValid = checkValidity();
  ```

- **Plural**: Start with `have` or `are`
  ```typescript
  const haveErrors = errors.length > 0;
  const areItemsLoaded = items.every((item) => item.loaded);
  ```

### Observables (RxJS)

- **Observable variables**: Add `$` suffix
  ```typescript
  const user$ = new BehaviorSubject<TUser>(null);
  const isLoading$ = new Observable<boolean>();
  ```

### Private Members

- **Private methods/properties**: Underscore prefix is optional (but allowed)

  ```typescript
  class Bridge {
    private messageQueue: TMessage[] = [];
    private userId: string;

    private processQueue(): void {}

    // With underscore also acceptable
    private _internalState: string;
    private _validateInternal(): boolean {}
  }
  ```

### Enums

- **Enum names**: Use `PascalCase`, singular form

  ```typescript
  // ✅ Good: Singular
  enum Color {
    BLACK = 'black',
    RED = 'red',
  }

  enum CreditType {
    REGULAR = 'regular',
    SPECIAL = 'special',
  }

  // ❌ Bad: Plural
  enum Colors {}
  ```

- **Enum values**: Use `UPPER_SNAKE_CASE`
  ```typescript
  enum MessageType {
    REQUEST = 'request',
    RESPONSE = 'response',
    ERROR_OCCURRED = 'error_occurred',
  }
  ```

### Function Names

- **Action functions**: Use verbs or verb phrases

  ```typescript
  function sendMessage() {}
  function calculateTotal() {}
  function validateInput() {}
  ```

- **Return value description**: Name reflects what is returned
  ```typescript
  function getUserName(): string {}
  function isValid(): boolean {}
  function getErrorMessage(): string {}
  ```

### File Naming

- Add suffix for specific entity types:
  ```
  .model.ts    - Domain models
  .types.ts    - Type definitions
  .const.ts    - Constants
  .service.ts  - Services
  .channel.ts  - Channel implementations
  .test.ts     - Tests
  ```

---

## Type Definitions

### Types vs Interfaces

- **Use Types** for object shapes, unions, and most cases

  ```typescript
  type TUser = {
    id: string;
    name: string;
  };

  type TConfig = {
    apiUrl: string;
    timeout: number;
  };
  ```

- **Use Interfaces** ONLY when you need to implement them with `implements`

  ```typescript
  interface IChannel {
    send(message: TInternalMessage): void;
    onMessage(handler: (message: TInternalMessage) => void): void;
  }

  class IframeChannel implements IChannel {
    // Implementation
  }
  ```

### Naming

- **Types**: Prefix with `T`

  ```typescript
  type TUser = { id: string; name: string };
  type TBridgeConfig = { side: 'main' | 'worker' };
  type TMessageHandler = (msg: TInternalMessage) => void;
  ```

- **Interfaces**: Prefix with `I`
  ```typescript
  interface IChannel {}
  interface ILogger {}
  interface IRepository {}
  ```

### null vs undefined

Use explicit typing for null/undefined. Optional marker `?` indicates possible absence of key, not its value.

```typescript
// ✅ Good: Explicit null typing
class Bridge {
  private currentUser: TUser | null = null;
  private errorMessage: string | null = null;

  getUser(): TUser | null {
    return this.currentUser;
  }
}

// ❌ Bad: Using undefined for values
class Bridge {
  private currentUser?: TUser; // Means key might not exist
}
```

### Avoid `any`, Use `unknown`

```typescript
// ❌ Bad
function processData(data: any) {}

// ✅ Good
function processData(data: unknown) {
  if (typeof data === 'string') {
    // TypeScript knows data is string here
  }
}
```

### Explicit Return Types

Always specify return types for getters, methods, and functions:

```typescript
// ✅ Good
class Bridge {
  private _isReady: boolean = false;

  get isReady(): boolean {  // Explicit return type
    return this._isReady;
  }

  initialize(): void {  // Explicit void
    this._isReady = true;
  }

  getUserData(): Promise<TUser> {  // Explicit Promise type
    return fetch('/api/user').then(r => r.json());
  }
}

// ❌ Bad: Inferred types
get isReady() {  // Avoid inference
  return this._isReady;
}
```

### Use `void` for Functions Without Return

```typescript
function start(): void {
  console.log('Starting...');
}

function initialize(): void {
  registerHandlers();
}

// Note: Setters don't need void (TypeScript error)
set value(v: number) {
  this._value = v;
}
```

### Prefer `enum` Over String Literal Types

```typescript
// ✅ Good: Using enum
enum MessageType {
  REQUEST = 'request',
  RESPONSE = 'response',
}

function handleMessage(type: MessageType) {}

// ❌ Bad: String literal type
type MessageType = 'request' | 'response';
```

---

## Logical Operators and Conditions

### Use `if` for Actions

Prefer `if` over `&&` for executing actions. Makes conditions more visible:

```typescript
// ✅ Good
if (condition) {
  doSomething();
}

if (isValid) {
  saveData();
}

// ❌ Bad
condition && doSomething();
isValid && saveData();
```

### Extract Complex Conditions

Don't use complex expressions directly in `if` or conditionals. Extract to variables or functions:

```typescript
// ✅ Good
const isValidData = conditionA && conditionB && isConditionC();

if (isValidData) {
  doSomething();
}

const canProceed = user.isActive && user.hasPermission('write') && !user.isBanned;
if (canProceed) {
  processRequest();
}

// ❌ Bad
if (conditionA && conditionB && isConditionC()) {
  doSomething();
}

if (user.isActive && user.hasPermission('write') && !user.isBanned) {
  processRequest();
}
```

### Always Use Curly Braces in `if`

Always use braces, even for single statements. Improves readability and makes debugging easier:

```typescript
// ✅ Good
if (condition) {
  doSomething();
}

if (anotherCondition) {
  return;
}

// ❌ Bad
if (condition) doSomething();
if (anotherCondition) return;
```

---

## Functions and Arguments

### Object Arguments for 3+ Parameters

When function has 3 or more arguments, pass them as an object with typed interface:

```typescript
// ✅ Good: Object argument
type TCreateBridgeArgs = {
  channel: IChannel;
  namespace: string;
  timeout?: number;
  retryCount?: number;
};

function createBridge(args: TCreateBridgeArgs): Bridge {
  // Implementation
}

// Usage
createBridge({
  channel: myChannel,
  namespace: 'my-namespace',
  timeout: 5000,
});

// ❌ Bad: Many individual arguments
function createBridge(
  channel: IChannel,
  namespace: string,
  timeout?: number,
  retryCount?: number
): Bridge {}
```

---

## Imports

### No Empty Lines Between Imports

```typescript
// ✅ Good
import { Bridge } from '@tschannel/core';
import { IframeChannel } from '@tschannel/iframe-channel';
import { generateId } from './utils';
import { TConfig } from './types';

// ❌ Bad
import { Bridge } from '@tschannel/core';

import { IframeChannel } from '@tschannel/iframe-channel';

import { generateId } from './utils';
```

### Bracket Spacing

Always use spaces inside object/import braces:

```typescript
// ✅ Good
import { Bridge, createBridge } from '@tschannel/core';
const config = { timeout: 5000, retries: 3 };
const { user, permissions } = data;

// ❌ Bad
import { Bridge, createBridge } from '@tschannel/core';
const config = { timeout: 5000, retries: 3 };
const { user, permissions } = data;
```

### Relative Imports Start With Dot

```typescript
// ✅ Good
import { ClaimForm } from './claim-form';
import { utils } from '../utils';
import { TUser } from './types';

// ❌ Bad
import { ClaimForm } from 'claim-form'; // No dot
```

---

## Comments and Documentation

### Models and Types

All properties in models/types should have JSDoc descriptions:

```typescript
/**
 * User information
 */
type TUser = {
  /**
   * Unique user identifier
   */
  id: string;

  /**
   * User's full name
   */
  name: string;

  /**
   * User's email address for notifications
   */
  email: string;
};
```

### Methods and Functions

Document public methods, especially domain logic:

```typescript
class BridgeService {
  /**
   * Sends a message through the bridge and waits for response.
   * If no response received within timeout, throws error.
   *
   * @param message - Message to send
   * @param timeout - Maximum wait time in milliseconds
   * @returns Response from remote side
   * @throws {TimeoutError} When response not received in time
   */
  async sendAndWait(message: TMessage, timeout: number): Promise<TResponse> {
    // Implementation
  }

  /**
   * Validates message format according to protocol specification.
   * Checks required fields and data types.
   *
   * @param message - Message to validate
   * @returns True if message is valid
   */
  private _validateMessage(message: TMessage): boolean {
    // Implementation
  }
}
```

### Complex Business Logic

For complex business logic, create a separate `README.md` file in the relevant directory explaining:

- What happens
- How it happens
- Why it happens (business rationale)

---

## Complex Types and Type Guards

### Complex Types Structure

Break complex types into smaller, well-named parts:

```typescript
// Common properties
type TButtonCommon = {
  title: string;
  hint: string;
};

// Variant A
type TButtonUnion = TButtonCommon & {
  type: 'button_union';
  onClick: () => void;
};

// Variant B
type TButton15 = TButtonCommon & {
  type: 'button_t15';
  t15: {
    serviceName: string;
    functionName: string;
  };
};

// Final union type
type TMenuButton = TButtonUnion | TButton15;
```

### Type Guards

Write type guards as separate functions with `is` prefix:

```typescript
function isUnionButton(button: TMenuButton): button is TButtonUnion {
  return button.type === 'button_union';
}

function is15Button(button: TMenuButton): button is TButton15 {
  return button.type === 'button_t15';
}

// Usage
if (isUnionButton(button)) {
  button.onClick(); // TypeScript knows it's TButtonUnion
}
```

---

## Code Quality Rules

### Magic Numbers

Extract magic numbers to named constants:

```typescript
// ❌ Bad
if (retryCount > 3) {
}
setTimeout(() => {}, 5000);

// ✅ Good
const MAX_RETRY_COUNT = 3;
const DEFAULT_TIMEOUT_MS = 5000;

if (retryCount > MAX_RETRY_COUNT) {
}
setTimeout(() => {}, DEFAULT_TIMEOUT_MS);
```

### Single Responsibility

Functions and methods should do ONE thing:

```typescript
// ✅ Good: Separate concerns
function validateUser(user: TUser): boolean {}
function saveUser(user: TUser): Promise<void> {}

// ❌ Bad: Multiple responsibilities
function validateAndSaveUser(user: TUser): Promise<boolean> {}
```

---

## Testing Conventions

### Test File Naming

```typescript
// bridge.ts
export class Bridge {}

// bridge.test.ts
describe('Bridge', () => {
  it('should initialize correctly', () => {});
});
```

### Test Structure

```typescript
describe('FeatureName', () => {
  describe('methodName', () => {
    it('should do expected behavior', () => {
      // Arrange
      const input = createInput();

      // Act
      const result = method(input);

      // Assert
      expect(result).toBe(expected);
    });
  });
});
```

---

## Examples

### Good Code Example

```typescript
/**
 * Configuration for IFrame channel
 */
type TIframeChannelConfig = {
  /**
   * Side of communication (main or worker)
   */
  side: 'main' | 'worker';

  /**
   * IFrame element for main side
   */
  iframe?: HTMLIFrameElement;

  /**
   * Target origin for postMessage security
   */
  targetOrigin?: string;
};

/**
 * Channel implementation for iframe communication via postMessage
 */
class IframeChannel implements IChannel {
  private isReady: boolean = false;
  private messageHandler: TMessageHandler | null = null;

  /**
   * Creates iframe channel instance
   * @param config - Channel configuration
   */
  constructor(private config: TIframeChannelConfig) {
    this.validateConfig(config);
  }

  /**
   * Returns true if channel is ready for communication
   */
  get ready(): boolean {
    return this.isReady;
  }

  /**
   * Initializes channel and sets up message listeners
   */
  initialize(): void {
    const hasValidConfig = this.validateConfig(this.config);

    if (!hasValidConfig) {
      throw new Error('Invalid channel configuration');
    }

    this.setupListeners();
    this.isReady = true;
  }

  /**
   * Validates channel configuration
   * @param config - Configuration to validate
   * @returns True if configuration is valid
   */
  private validateConfig(config: TIframeChannelConfig): boolean {
    const isMainSide = config.side === 'main';
    const hasIframe = config.iframe !== undefined;

    if (isMainSide && !hasIframe) {
      return false;
    }

    return true;
  }

  /**
   * Sets up message event listeners
   */
  private setupListeners(): void {
    window.addEventListener('message', this.handleMessage.bind(this));
  }

  /**
   * Handles incoming message events
   * @param event - Message event from postMessage
   */
  private handleMessage(event: MessageEvent): void {
    if (!this.messageHandler) {
      return;
    }

    const isValidOrigin = this.validateOrigin(event.origin);

    if (isValidOrigin) {
      this.messageHandler(event.data);
    }
  }

  /**
   * Validates message origin for security
   * @param origin - Origin to validate
   * @returns True if origin is allowed
   */
  private validateOrigin(origin: string): boolean {
    const expectedOrigin = this.config.targetOrigin;

    if (!expectedOrigin) {
      return true; // Allow all origins if not specified
    }

    return origin === expectedOrigin;
  }
}
```

---

## Enforcement

These conventions are enforced through:

- **ESLint**: Catches style violations automatically
- **Prettier**: Formats code consistently
- **Code Reviews**: Manual verification of conventions
- **TypeScript**: Type safety and explicit typing

See `.claude/README.md` for instructions on running linters and formatters.

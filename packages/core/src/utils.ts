/**
 * Generate unique message ID
 */
export function generateMessageId(namespace: string): string {
  return `${namespace}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

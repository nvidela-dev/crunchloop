export class UnsupportedRemoteOperationError extends Error {
  constructor(operation: string) {
    super(`Remote operation not supported by this connector: ${operation}`);
    this.name = 'UnsupportedRemoteOperationError';
  }
}

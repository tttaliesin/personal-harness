/** Stable public errors for CLI and host adapters. */
export class OrchestratorError extends Error {
  constructor(code, message, details, options) {
    super(message, options);
    this.name = 'OrchestratorError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function requireCondition(condition, code, message, details) {
  if (!condition) throw new OrchestratorError(code, message, details);
}

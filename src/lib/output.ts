let jsonMode = false;

export function setJsonMode(enabled: boolean): void {
  jsonMode = enabled;
}

export function isJsonMode(): boolean {
  return jsonMode;
}

export function formatSuccess(message: string, data?: Record<string, unknown>): string {
  if (jsonMode) {
    return JSON.stringify({ success: true, data: data ?? {} });
  }
  return message;
}

export function formatError(message: string, code: number): string {
  if (jsonMode) {
    return JSON.stringify({ success: false, error: message, code });
  }
  return `Error: ${message}`;
}

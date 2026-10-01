export class NotConfiguredError extends Error {
  readonly code = "NOT_CONFIGURED";
  constructor(
    public readonly integration: string,
    public readonly missing: string[],
  ) {
    super(`${integration} is not configured. Missing env: ${missing.join(", ")}`);
  }
}

export class IntegrationError extends Error {
  readonly code = "INTEGRATION_ERROR";
  constructor(
    public readonly integration: string,
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(`${integration}: ${message}`);
  }
}

/** Throws NotConfiguredError listing every missing variable. Returns the values in order. */
export function requireEnv(integration: string, names: string[]): string[] {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) throw new NotConfiguredError(integration, missing);
  return names.map((n) => process.env[n]!);
}

export function envPresence(names: string[]): { name: string; present: boolean }[] {
  return names.map((name) => ({ name, present: !!process.env[name] }));
}

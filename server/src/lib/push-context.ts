export interface PushLogContext {
  userId?: string;
  source?: "single" | "user" | "broadcast" | "reminder";
}

export function getPushEndpointHost(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).host;
  } catch {
    return undefined;
  }
}

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  requestId?: string;
  userId?: string;
  data?: Record<string, unknown>;
}

function write(level: LogEntry["level"], message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(data && { data }),
  };
  console.log(JSON.stringify(entry));
}

export const logger = {
  info(message: string, data?: Record<string, unknown>): void {
    write("info", message, data);
  },
  warn(message: string, data?: Record<string, unknown>): void {
    write("warn", message, data);
  },
  error(message: string, data?: Record<string, unknown>): void {
    write("error", message, data);
  },
  /**
   * Returns a scoped logger that automatically includes requestId and userId
   * in every log entry.
   */
  withContext(requestId?: string, userId?: string) {
    return {
      info(message: string, data?: Record<string, unknown>): void {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: "info",
          message,
          ...(requestId && { requestId }),
          ...(userId && { userId }),
          ...(data && { data }),
        };
        console.log(JSON.stringify(entry));
      },
      warn(message: string, data?: Record<string, unknown>): void {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: "warn",
          message,
          ...(requestId && { requestId }),
          ...(userId && { userId }),
          ...(data && { data }),
        };
        console.log(JSON.stringify(entry));
      },
      error(message: string, data?: Record<string, unknown>): void {
        const entry: LogEntry = {
          timestamp: new Date().toISOString(),
          level: "error",
          message,
          ...(requestId && { requestId }),
          ...(userId && { userId }),
          ...(data && { data }),
        };
        console.log(JSON.stringify(entry));
      },
    };
  },
};

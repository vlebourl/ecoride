export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  message: string;
  requestId?: string;
  userId?: string;
  data?: Record<string, unknown>;
}

type LogContext = Pick<LogEntry, "requestId" | "userId">;

function buildEntry(
  level: LogEntry["level"],
  message: string,
  data?: Record<string, unknown>,
  context?: LogContext,
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context?.requestId ? { requestId: context.requestId } : {}),
    ...(context?.userId ? { userId: context.userId } : {}),
    ...(data ? { data } : {}),
  };
}

function write(
  level: LogEntry["level"],
  message: string,
  data?: Record<string, unknown>,
  context?: LogContext,
): void {
  console.log(JSON.stringify(buildEntry(level, message, data, context)));
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
    const context = { requestId, userId };
    return {
      info(message: string, data?: Record<string, unknown>): void {
        write("info", message, data, context);
      },
      warn(message: string, data?: Record<string, unknown>): void {
        write("warn", message, data, context);
      },
      error(message: string, data?: Record<string, unknown>): void {
        write("error", message, data, context);
      },
    };
  },
};

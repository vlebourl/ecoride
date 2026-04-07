type ErrorLogger = {
  error(message: string, data?: Record<string, unknown>): void;
};

function serializeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function reportBackgroundError(
  promise: Promise<unknown>,
  logger: ErrorLogger,
  message: string,
  data?: Record<string, unknown>,
): void {
  void promise.catch((err) => {
    logger.error(message, {
      ...data,
      error: serializeError(err),
    });
  });
}

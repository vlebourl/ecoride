type TerminationSignal = "SIGTERM" | "SIGINT";

interface SignalEmitter {
  on(signal: TerminationSignal, listener: () => void): unknown;
  off(signal: TerminationSignal, listener: () => void): unknown;
}

export function forwardTerminationSignals(
  child: { kill(signal: TerminationSignal): unknown },
  emitter: SignalEmitter = process,
): () => void {
  const onSigterm = () => child.kill("SIGTERM");
  const onSigint = () => child.kill("SIGINT");
  emitter.on("SIGTERM", onSigterm);
  emitter.on("SIGINT", onSigint);

  return () => {
    emitter.off("SIGTERM", onSigterm);
    emitter.off("SIGINT", onSigint);
  };
}

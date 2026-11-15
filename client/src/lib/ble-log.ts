// Super73 Bluetooth diagnostics. The connection lives entirely in the browser,
// so a failed connection used to leave no trace: these events are batched and
// stored server-side (audit_logs, action "ble_debug") to diagnose it afterwards.
// ponytail: always on for Super73 riders; a handful of events per connection.

const FLUSH_DELAY_MS = 2_000;
const MAX_BATCH = 100;

type BleLogEvent = { at: string; event: string; detail?: string };

let buffer: BleLogEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

export function bleLog(event: string, detail?: string): void {
  const visibility = typeof document !== "undefined" ? document.visibilityState : "n/a";
  const full = detail ? `${detail} [${visibility}]` : `[${visibility}]`;
  buffer.push({ at: new Date().toISOString(), event, detail: full.slice(0, 300) });
  console.info(`[BLE] ${event} ${full}`);
  if (buffer.length >= MAX_BATCH) {
    flushBleLog();
    return;
  }
  flushTimer ??= setTimeout(flushBleLog, FLUSH_DELAY_MS);
}

export function flushBleLog(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (buffer.length === 0) return;
  const events = buffer.slice(0, MAX_BATCH);
  buffer = buffer.slice(MAX_BATCH);
  // Plain fetch, not apiFetch: a diagnostic must never redirect to /login or throw.
  void fetch(`${import.meta.env.VITE_API_URL || "/api"}/user/ble-log`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : undefined,
      events,
    }),
  }).catch(() => {});
}

if (typeof document !== "undefined") {
  // Last chance before the page is backgrounded or closed.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBleLog();
  });
}

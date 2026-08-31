import {
  createContext,
  createElement,
  useState,
  useRef,
  useCallback,
  useEffect,
  useContext,
  type ReactNode,
} from "react";
import {
  isBleSupported,
  isBleDebugEnabled,
  scanAndConnect,
  reconnectPairedDevice,
  readState,
  writeState,
  startStateNotifications,
  readRide,
  type Super73State,
  type Super73Mode,
} from "@/lib/super73-ble";

// When the rider sets assist level to ASSIST_EPAC_TRIGGER from the bike's
// physical buttons, the app automatically resets the mode to EPAC (eco).
// This lets the rider switch back to legal-speed mode from the bike itself
// while the phone is in their pocket.
export const ASSIST_EPAC_TRIGGER = 3;

// Every connection ends with the assist at this level (#349). The bike can boot
// at 0 and still report something else, so — exactly like the light (#348) — a
// conditional write is not enough: the register value has to actually change for
// the hardware to follow. The sequence writes the floor first, then the target,
// so the move *into* the target is a real transition whatever the bike claimed.
//
// The floor's only job is to be a value other than the target, which is why it
// is 2 rather than 0. Every connection path runs this sequence, auto-reconnect
// included, so it can fire mid-ride with the phone in a pocket: a floor of 0
// would cut the assist out from under a pedalling rider for the length of a BLE
// round trip. 2 gives the same guaranteed transition without that.
//
// Neither step is ASSIST_EPAC_TRIGGER. Reaching 3 is the rider's signal to force
// the bike into EPAC, so stepping onto it would hand back a mode change nobody
// asked for. Assist is written as an absolute value, not as "one level up", so
// the intermediate levels buy nothing anyway: the steps skip the trigger rather
// than pass through it. (The light frames still carry whatever assist the bike
// reported, 3 included — they change only the light bit.)
export const CONNECT_ASSIST_TARGET = 4;
const CONNECT_ASSIST_FLOOR = 2;

export function shouldTriggerEpac(state: Super73State): boolean {
  return state.assist === ASSIST_EPAC_TRIGGER && state.mode !== "eco";
}

export type BleStatus = "disconnected" | "connecting" | "connected" | "unsupported" | "error";

const STATE_KEY = "ecoride-super73-state";
const RECONNECT_DELAY = 2_000;
const MAX_RECONNECT_ATTEMPTS = 1;
// TODO: EPAC poll disabled for observation — the BLE notifier appears reliable on all
// tested firmware versions. If no regression is reported, remove poll entirely.
// If a firmware where the notifier silently fails is found, re-enable and consider
// a smarter trigger (one-shot after action rather than fixed interval).
// const EPAC_TRIGGER_POLL_INTERVAL_MS = 5_000;
// Battery/range change slowly; a low-frequency poll guarantees telemetry even if
// the notifier never pushes RIDE frames on a given firmware.
const RIDE_POLL_INTERVAL_MS = 20_000;
const DEFAULT_AUTO_MODE_LOW_SPEED_KMH = 10;
const DEFAULT_AUTO_MODE_HIGH_SPEED_KMH = 17;

type AutoModeZone = "low" | "high" | null;

export type Super73TripModeSelection = "eco" | "race" | "auto";

export function deriveTripModeSelection(
  state: Super73State | null,
  preferences: Super73Preferences,
  tracking: Super73TrackingInput,
  currentSelection: Super73TripModeSelection | null = null,
): Super73TripModeSelection {
  // Assist 3 = EPAC enforcement — auto mode doesn't apply. The icon must stay
  // honest: show off-road only while the bike actually reports race (e.g. the EPAC
  // write is still pending or failed). Once enforcement lands (mode === eco) it
  // shows EPAC. Don't blindly assume eco, or a failed write would claim EPAC while
  // the bike is still in off-road for as long as assist stays at 3. See #326.
  if (state?.assist === 3) return state.mode === "race" ? "race" : "eco";
  if (currentSelection === "auto")
    return tracking.isTracking ? "auto" : state?.mode === "race" ? "race" : "eco";
  if (currentSelection === "eco" || currentSelection === "race") return currentSelection;
  if (preferences.autoModeEnabled && tracking.isTracking) return "auto";
  return state?.mode === "race" ? "race" : "eco";
}

function nextTripModeSelection(current: Super73TripModeSelection): Super73TripModeSelection {
  return current === "eco" ? "race" : current === "race" ? "auto" : "eco";
}

export interface Super73Preferences {
  autoModeEnabled: boolean;
  defaultMode: Super73Mode | null;
  autoModeLowSpeedKmh?: number | null;
  autoModeHighSpeedKmh?: number | null;
}

export interface Super73TrackingInput {
  isTracking: boolean;
  speedKmh: number | null;
}

const DEFAULT_PREFERENCES: Super73Preferences = {
  autoModeEnabled: false,
  defaultMode: null,
  autoModeLowSpeedKmh: DEFAULT_AUTO_MODE_LOW_SPEED_KMH,
  autoModeHighSpeedKmh: DEFAULT_AUTO_MODE_HIGH_SPEED_KMH,
};

const DEFAULT_TRACKING_INPUT: Super73TrackingInput = {
  isTracking: false,
  speedKmh: null,
};

function loadCachedState(): Super73State | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as Super73State) : null;
  } catch {
    return null;
  }
}

function cacheState(state: Super73State) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage full — ignore
  }
}

/**
 * Re-reads the state the bike actually holds after a write, so the UI follows the
 * bike rather than the value it was asked for. If only the read-back fails the
 * write itself still landed, so the written state is kept: reporting a connection
 * error there would hide the controls over a change that did apply.
 */
async function readBackState(
  server: BluetoothRemoteGATTServer,
  written: Super73State,
): Promise<Super73State> {
  try {
    return await readState(server);
  } catch {
    return written;
  }
}

export function buildStateFromPreferences(
  state: Super73State,
  preferences: Super73Preferences,
): Super73State | null {
  const next: Super73State = { ...state, mode: preferences.defaultMode ?? state.mode };

  // Light and assist are deliberately absent: connecting forces the light on
  // (#348) and drives the assist to CONNECT_ASSIST_TARGET (#349), so a stored
  // preference for either would have no say anyway.
  return next.mode === state.mode ? null : next;
}

export function resolveAutoModeZone(
  speedKmh: number | null,
  lowSpeedThresholdKmh = DEFAULT_AUTO_MODE_LOW_SPEED_KMH,
  highSpeedThresholdKmh = DEFAULT_AUTO_MODE_HIGH_SPEED_KMH,
): AutoModeZone {
  if (speedKmh == null || !Number.isFinite(speedKmh)) return null;
  if (speedKmh <= lowSpeedThresholdKmh) return "low";
  if (speedKmh >= highSpeedThresholdKmh) return "high";
  return null;
}

export function resolveAutoSuper73Mode(zone: AutoModeZone): Super73Mode | null {
  if (zone === "low") return "race";
  if (zone === "high") return "eco";
  return null;
}

export interface UseSuper73Result {
  status: BleStatus;
  bikeState: Super73State | null;
  /** Speed in km/h from the S73 wheel sensor (02 01 BLE packet). Null when not connected. */
  bikeSpeedKmh: number | null;
  /** Estimated battery percentage (0–100) from the bike's RIDE telemetry. Null until first read. */
  batteryPercent: number | null;
  /** Estimated remaining range in km from the bike's RIDE telemetry. Null until first read. */
  rangeKm: number | null;
  error: string | null;
  tripModeSelection: Super73TripModeSelection;
  connect: () => Promise<void>;
  disconnect: () => void;
  setMode: (mode: Super73Mode) => Promise<void>;
  setAssist: (level: number) => Promise<void>;
  setLight: (on: boolean) => Promise<void>;
  toggleMode: () => Promise<void>;
  cycleTripModeSelection: () => Promise<void>;
  /** True when the 5 s poll (not the BLE notifier) caught an EPAC trigger. */
  epacPollFallbackWarning: boolean;
  dismissEpacPollFallback: () => void;
}

const NOOP_RESULT: UseSuper73Result = {
  status: "unsupported",
  bikeState: null,
  bikeSpeedKmh: null,
  batteryPercent: null,
  rangeKm: null,
  error: null,
  tripModeSelection: "eco",
  connect: async () => {},
  disconnect: () => {},
  setMode: async () => {},
  setAssist: async () => {},
  setLight: async () => {},
  toggleMode: async () => {},
  cycleTripModeSelection: async () => {},
  epacPollFallbackWarning: false,
  dismissEpacPollFallback: () => {},
};

const Super73Context = createContext<UseSuper73Result>(NOOP_RESULT);

function useSuper73Controller(
  enabled: boolean,
  preferences: Super73Preferences,
  tracking: Super73TrackingInput,
): UseSuper73Result {
  const [status, setStatus] = useState<BleStatus>(() =>
    !enabled ? "disconnected" : isBleSupported() ? "disconnected" : "unsupported",
  );
  const [bikeState, setBikeState] = useState<Super73State | null>(loadCachedState);
  const [bikeSpeedKmh, setBikeSpeedKmh] = useState<number | null>(null);
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [rangeKm, setRangeKm] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tripModeSelectionIntent, setTripModeSelectionIntent] =
    useState<Super73TripModeSelection | null>(null);
  const [epacPollFallbackWarning, setEpacPollFallbackWarning] = useState(false);

  const deviceRef = useRef<BluetoothDevice | null>(null);
  const serverRef = useRef<BluetoothRemoteGATTServer | null>(null);
  // Serialises state updates end to end. applyPatch swallows its own errors, so
  // a failed update never wedges the queue for the ones behind it.
  const updateQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Bumped on every attach. A queued update carries the session it was issued
  // for, so one waiting its turn is dropped rather than replayed onto a later
  // connection — reconnecting reuses the same `device.gatt`, so comparing the
  // server object would not catch it.
  const bleSessionRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoReconnectAttemptedRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const lastAutoModeZoneRef = useRef<AutoModeZone>(null);
  // Prevents re-entrant polling if a poll round takes longer than the interval.
  const isPollActiveRef = useRef(false);
  // Cleanup function returned by startStateNotifications; null = notifier unavailable.
  const notifierCleanupRef = useRef<(() => void) | null>(null);

  // Notifier handler — only receives state packets (byte[0]=0x03), telemetry
  // filtered out in startStateNotifications. Safe to update app state here.
  // When ecoride-ble-debug=1: also fires an immediate poll for side-by-side comparison.
  const notifierHandlerBodyRef = useRef<((state: Super73State) => void) | null>(null);
  const notifierHandlerBody = useCallback((state: Super73State) => {
    setBikeState(state);
    cacheState(state);
    if (shouldTriggerEpac(state) && serverRef.current?.connected) {
      const epacState: Super73State = { ...state, mode: "eco" };
      // Queued like any other write, and issued from the notifier — the path most
      // likely to fire just as the link drops — so it carries the session too.
      const session = bleSessionRef.current;
      void writeState(serverRef.current, epacState, () => session === bleSessionRef.current)
        .then(() => {
          if (session !== bleSessionRef.current) return;
          setBikeState(epacState);
          cacheState(epacState);
          // Reset the stale trip-mode intent (e.g. "race") ONLY after the bike has
          // confirmed eco. The assist===3 branch in deriveTripModeSelection masks the
          // stale intent while assist stays at the trigger level; without this reset
          // it would resurface as the off-road icon once assist returns to 4 even
          // though the mode legitimately stays eco. Gating on write success is what
          // keeps the icon honest: a *failed* write must leave the icon on the bike's
          // real (still off-road) mode rather than claiming EPAC. See #326.
          setTripModeSelectionIntent("eco");
        })
        .catch(() => {
          // Write failed: leave bikeState and the trip-mode intent untouched so the
          // icon keeps reflecting the bike's real mode. The bike is still at the
          // trigger assist level with a non-eco mode, so the next notifier packet
          // re-triggers EPAC enforcement.
        });
    }
    if (isBleDebugEnabled() && !isPollActiveRef.current && serverRef.current?.connected) {
      isPollActiveRef.current = true;
      void readState(serverRef.current, "poll").finally(() => {
        isPollActiveRef.current = false;
      });
    }
  }, []);

  useEffect(() => {
    notifierHandlerBodyRef.current = notifierHandlerBody;
  }, [notifierHandlerBody]);

  const stableNotifierHandler = useCallback(
    (state: Super73State) => notifierHandlerBodyRef.current?.(state),
    [],
  );

  /**
   * Post-connect init: apply the mode preference, force the front light on with
   * an off→on cycle, then drive the assist to CONNECT_ASSIST_TARGET with a
   * floor→target cycle.
   *
   * Both cycles are unconditional. Writing a value the bike already claims to
   * hold does nothing, and the reported state is not always the truth — the bike
   * can boot dark and at assist 0 while reporting otherwise. Only a real change
   * of the register value guarantees the hardware follows. Every frame carries
   * mode, assist and light together, since they share one 10-byte register.
   */
  const runConnectInitSequence = useCallback(
    async (
      server: BluetoothRemoteGATTServer,
      state: Super73State,
      session: number,
    ): Promise<Super73State> => {
      // buildStateFromPreferences returns null when nothing differs from the
      // bike; the cycles run either way, so fall back to the state we read.
      const base = buildStateFromPreferences(state, preferences) ?? state;
      const isCurrentSession = () => session === bleSessionRef.current;

      // Second frame of a cycle: the first one has already landed, so giving up
      // here leaves the bike dark, or stuck at the assist floor — not what the
      // rider asked for, and nothing retries a connection that ended in "error".
      // Give a transient GATT timeout one more chance first.
      const writeWithRetry = async (frame: Super73State) => {
        try {
          await writeState(server, frame, isCurrentSession);
        } catch {
          if (!isCurrentSession()) return;
          await writeState(server, frame, isCurrentSession);
        }
      };

      await writeState(server, { ...base, light: false }, isCurrentSession);
      // The link can drop while a write waits in the queue. If it did, nothing
      // reached the bike, so report the state we actually read. Nothing is
      // published either way — attachDevice drops the whole result once the
      // session has moved on — and the next connection runs the sequence again.
      if (!isCurrentSession()) return state;

      const litState: Super73State = { ...base, light: true };
      await writeWithRetry(litState);
      if (!isCurrentSession()) return state;

      await writeState(server, { ...litState, assist: CONNECT_ASSIST_FLOOR }, isCurrentSession);
      if (!isCurrentSession()) return state;

      const finalState: Super73State = { ...litState, assist: CONNECT_ASSIST_TARGET };
      try {
        await writeWithRetry(finalState);
      } catch (e) {
        // The floor frame has already landed, so giving up here would strand the
        // bike at a level this app picked rather than the one the rider had. Put
        // it back, with the same one retry as every other write here whose
        // failure leaves the bike worse off. Written unconditionally even when
        // the read said the floor — a reported level that disagrees with the
        // hardware is the whole premise of this sequence.
        //
        // This narrows the window rather than closing it: a link that has already
        // refused three writes can refuse two more, and then the bike really is
        // left at the floor. Nothing this code can do alone fixes a dead link, so
        // the original error stands either way — swallowing it would report a
        // healthy connection to a bike stuck mid-sequence.
        if (isCurrentSession()) {
          await writeWithRetry({ ...litState, assist: state.assist }).catch(() => {});
        }
        throw e;
      }
      if (!isCurrentSession()) return state;
      return finalState;
    },
    [preferences],
  );

  // Attach device listeners and read initial state
  const attachDevice = useCallback(
    async (device: BluetoothDevice) => {
      deviceRef.current = device;
      serverRef.current = device.gatt!;
      bleSessionRef.current += 1;
      const session = bleSessionRef.current;
      reconnectAttemptsRef.current = 0;
      manualDisconnectRef.current = false;
      lastAutoModeZoneRef.current = null;

      // Connecting takes several awaits, and the bike can drop during any of
      // them. Finishing the sequence for a session that already ended would
      // report a connected bike the app is not talking to. A drop also *rejects*
      // whatever operation was in flight, so the whole sequence is wrapped: by
      // then onDisconnected has set the right status, and letting the rejection
      // reach connect()'s catch would overwrite it with "error".
      try {
        const currentState = await readState(device.gatt!, "connect");
        if (session !== bleSessionRef.current) return;
        const finalState = await runConnectInitSequence(device.gatt!, currentState, session);
        if (session !== bleSessionRef.current) return;
        setBikeState(finalState);
        cacheState(finalState);
        // Try to subscribe to push notifications. Returns null if unsupported.
        const notifierCleanup = await startStateNotifications(
          device.gatt!,
          stableNotifierHandler,
          setBikeSpeedKmh,
          (ride) => {
            setBatteryPercent(ride.batteryPercent);
            setRangeKm(ride.rangeKm);
          },
        );
        if (session !== bleSessionRef.current) {
          // Tear down the subscription we just made rather than storing it: the
          // teardown for this session has already run, so nothing else would.
          notifierCleanup?.();
          return;
        }
        notifierCleanupRef.current = notifierCleanup;
        setStatus("connected");
      } catch (e) {
        if (session !== bleSessionRef.current) return;
        // `gattserverdisconnected` is delivered asynchronously, so a real drop
        // rejects the in-flight operation *before* onDisconnected runs and moves
        // the session. Ask the link itself rather than trusting the counter.
        if (!device.gatt?.connected) {
          // Only downgrade our own "connecting": if onDisconnected has already
          // scheduled a reconnect, that attempt owns the status from here.
          setStatus((prev) => (prev === "connecting" ? "disconnected" : prev));
          return;
        }
        throw e;
      }
    },
    [runConnectInitSequence, stableNotifierHandler],
  );

  // Auto-reconnect on unexpected disconnect
  const tryReconnect = useCallback(async () => {
    if (manualDisconnectRef.current || reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      setStatus("disconnected");
      return;
    }
    reconnectAttemptsRef.current += 1;
    setStatus("connecting");
    try {
      const device = await reconnectPairedDevice();
      if (device) {
        await attachDevice(device);
      } else {
        setStatus("disconnected");
      }
    } catch {
      setStatus("disconnected");
    }
  }, [attachDevice]);

  const onDisconnected = useCallback(() => {
    notifierCleanupRef.current?.();
    notifierCleanupRef.current = null;
    serverRef.current = null;
    // Losing the bike ends the session on its own, reconnection or not: an
    // update still in flight must not publish state it read over this link.
    bleSessionRef.current += 1;
    lastAutoModeZoneRef.current = null;
    setBikeSpeedKmh(null);
    setBatteryPercent(null);
    setRangeKm(null);
    if (manualDisconnectRef.current) {
      setStatus("disconnected");
      return;
    }
    reconnectTimerRef.current = setTimeout(tryReconnect, RECONNECT_DELAY);
  }, [tryReconnect]);

  useEffect(() => {
    const device = deviceRef.current;
    if (!device) return;
    device.addEventListener("gattserverdisconnected", onDisconnected);
    return () => {
      device.removeEventListener("gattserverdisconnected", onDisconnected);
    };
  }, [status, onDisconnected]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !isBleSupported()) {
      autoReconnectAttemptedRef.current = false;
      return;
    }
    if (status !== "disconnected") return;
    if (deviceRef.current || autoReconnectAttemptedRef.current) return;

    autoReconnectAttemptedRef.current = true;
    let cancelled = false;
    (async () => {
      const device = await reconnectPairedDevice();
      if (cancelled || !device) return;
      setStatus("connecting");
      try {
        await attachDevice(device);
      } catch {
        setStatus("disconnected");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, status, attachDevice]);

  const connect = useCallback(async () => {
    if (!enabled || !isBleSupported()) return;
    setStatus("connecting");
    setError(null);
    try {
      const device = await scanAndConnect();
      await attachDevice(device);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connexion échouée";
      if (msg.includes("cancelled") || msg.includes("NotFoundError")) {
        setStatus("disconnected");
      } else {
        setError(msg);
        setStatus("error");
      }
    }
  }, [enabled, attachDevice]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    lastAutoModeZoneRef.current = null;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    if (deviceRef.current) {
      deviceRef.current.gatt?.disconnect();
      deviceRef.current = null;
      serverRef.current = null;
    }
    // Same as onDisconnected: end the session so in-flight and queued updates
    // stop, whether or not `gattserverdisconnected` fires for a manual hang-up.
    bleSessionRef.current += 1;
    setStatus("disconnected");
  }, []);

  const applyPatch = useCallback(async (patch: Partial<Super73State>, session: number) => {
    const server = serverRef.current;
    // Re-checked here, not just at enqueue time: while this update waited its
    // turn the bike may have dropped, or dropped and come back — in which case
    // it belongs to a session the rider has left and must not be replayed.
    if (!server?.connected || session !== bleSessionRef.current) return;
    try {
      const current = await readState(server);
      // The session can end at any await, so re-check before touching the bike:
      // this write carries a pre-disconnect read, and since reconnecting reuses
      // the same `device.gatt` it would otherwise land on the next session.
      if (session !== bleSessionRef.current) return;
      const next: Super73State = { ...current, ...patch };
      // The check above guards the call; this one guards the write itself, which
      // runs a turn later from inside the GATT queue.
      await writeState(server, next, () => session === bleSessionRef.current);
      // Commit what the bike reports back, not what we asked for: a write the
      // bike refuses would otherwise leave the UI on an optimistic value until
      // the next notifier packet — and the notifier is absent on some firmware
      // (startStateNotifications returns null), so there may never be one.
      const confirmed = await readBackState(server, next);
      // The session can end mid-sequence too: don't publish state read from a
      // connection the rider has already left.
      if (session !== bleSessionRef.current) return;
      setBikeState(confirmed);
      cacheState(confirmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'écriture BLE");
      setStatus("error");
    }
  }, []);

  const updateState = useCallback(
    (patch: Partial<Super73State>) => {
      if (!serverRef.current?.connected || !bikeState) return Promise.resolve();
      // Queue the whole read-modify-write-confirm sequence. serializeGatt only
      // orders individual GATT operations, so two updates in flight would each
      // read the same state and the second write would drop the first one's
      // patch — e.g. auto-mode writing a mode while the rider taps the headlight.
      const session = bleSessionRef.current;
      const run = updateQueueRef.current.then(() => applyPatch(patch, session));
      updateQueueRef.current = run;
      return run;
    },
    [bikeState, applyPatch],
  );

  const setMode = useCallback((mode: Super73Mode) => updateState({ mode }), [updateState]);

  const setAssist = useCallback(
    (level: number) => updateState({ assist: Math.min(Math.max(level, 0), 4) }),
    [updateState],
  );

  const setLight = useCallback((on: boolean) => updateState({ light: on }), [updateState]);

  const tripModeSelection = deriveTripModeSelection(
    bikeState,
    preferences,
    tracking,
    tripModeSelectionIntent,
  );

  const toggleMode = useCallback(async () => {
    if (!bikeState) return;
    const nextMode: Super73Mode = bikeState.mode === "race" ? "eco" : "race";
    setTripModeSelectionIntent(nextMode === "race" ? "race" : "eco");
    await setMode(nextMode);
  }, [bikeState, setMode]);

  const cycleTripModeSelection = useCallback(async () => {
    let nextSelection = nextTripModeSelection(tripModeSelection);
    // Assist 3 = EPAC enforcement — skip "auto" in cycle
    if (nextSelection === "auto" && bikeState?.assist === 3) {
      nextSelection = nextTripModeSelection(nextSelection);
    }
    setTripModeSelectionIntent(nextSelection);
    lastAutoModeZoneRef.current = null;

    if (nextSelection === "auto") {
      if (!tracking.isTracking) return;
      const lowSpeedThresholdKmh =
        preferences.autoModeLowSpeedKmh ?? DEFAULT_AUTO_MODE_LOW_SPEED_KMH;
      const highSpeedThresholdKmh =
        preferences.autoModeHighSpeedKmh ?? DEFAULT_AUTO_MODE_HIGH_SPEED_KMH;
      const zone = resolveAutoModeZone(
        bikeSpeedKmh ?? tracking.speedKmh,
        lowSpeedThresholdKmh,
        highSpeedThresholdKmh,
      );
      const targetMode = resolveAutoSuper73Mode(zone);
      if (targetMode && targetMode !== bikeState?.mode) {
        await setMode(targetMode);
      }
      return;
    }

    const targetMode: Super73Mode = nextSelection === "race" ? "race" : "eco";
    if (targetMode !== bikeState?.mode) {
      await setMode(targetMode);
    }
  }, [
    bikeSpeedKmh,
    bikeState?.assist,
    bikeState?.mode,
    preferences.autoModeHighSpeedKmh,
    preferences.autoModeLowSpeedKmh,
    setMode,
    tracking.isTracking,
    tracking.speedKmh,
    tripModeSelection,
  ]);

  useEffect(() => {
    if (tripModeSelection !== "auto") {
      lastAutoModeZoneRef.current = null;
      return;
    }
    if (!tracking.isTracking || !bikeState || status !== "connected") return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

    const lowSpeedThresholdKmh = preferences.autoModeLowSpeedKmh ?? DEFAULT_AUTO_MODE_LOW_SPEED_KMH;
    const highSpeedThresholdKmh =
      preferences.autoModeHighSpeedKmh ?? DEFAULT_AUTO_MODE_HIGH_SPEED_KMH;
    // Prefer bike wheel speed (more accurate at low speed, no GPS noise).
    // Fall back to GPS speed when BLE speed is unavailable.
    const effectiveSpeedKmh = bikeSpeedKmh ?? tracking.speedKmh;
    const zone = resolveAutoModeZone(
      effectiveSpeedKmh,
      lowSpeedThresholdKmh,
      highSpeedThresholdKmh,
    );
    if (zone === null) return;
    if (zone === lastAutoModeZoneRef.current) return;

    const targetMode = resolveAutoSuper73Mode(zone);
    if (!targetMode || targetMode === bikeState.mode) {
      lastAutoModeZoneRef.current = zone;
      return;
    }

    lastAutoModeZoneRef.current = zone;
    void setMode(targetMode);
  }, [
    tripModeSelection,
    tracking.isTracking,
    bikeSpeedKmh,
    tracking.speedKmh,
    bikeState,
    status,
    setMode,
    preferences.autoModeLowSpeedKmh,
    preferences.autoModeHighSpeedKmh,
  ]);

  // Low-frequency RIDE telemetry poll (battery % + range). Seeds immediately on
  // connect, then refreshes every RIDE_POLL_INTERVAL_MS. Best-effort: errors are
  // swallowed and the indicator simply stays on its last value (or hidden).
  useEffect(() => {
    if (status !== "connected") return;
    const server = serverRef.current;
    if (!server) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const ride = await readRide(server);
        if (!cancelled && ride) {
          setBatteryPercent(ride.batteryPercent);
          setRangeKm(ride.rangeKm);
        }
      } catch {
        // best-effort telemetry — ignore transient BLE errors
      }
    };
    void poll();
    const id = setInterval(poll, RIDE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [status]);

  // TODO: poll disabled — see EPAC_TRIGGER_POLL_INTERVAL_MS comment above.
  // useEffect(() => {
  //   if (status !== "connected") return;
  //
  //   const pollId = setInterval(async () => {
  //     if (isPollActiveRef.current || !serverRef.current?.connected) return;
  //     isPollActiveRef.current = true;
  //     try {
  //       const polledState = await readState(serverRef.current);
  //       setBikeState(polledState);
  //       cacheState(polledState);
  //       if (shouldTriggerEpac(polledState)) {
  //         // Notifier didn't catch it (otherwise mode would already be eco).
  //         // Show a warning so the user knows the notifier isn't firing.
  //         setEpacPollFallbackWarning(true);
  //         const epacState: Super73State = { ...polledState, mode: "eco" };
  //         await writeState(serverRef.current, epacState);
  //         setBikeState(epacState);
  //         cacheState(epacState);
  //       }
  //     } catch {
  //       // Poll silently skipped — will retry on next interval.
  //     } finally {
  //       isPollActiveRef.current = false;
  //     }
  //   }, EPAC_TRIGGER_POLL_INTERVAL_MS);
  //
  //   return () => clearInterval(pollId);
  // }, [status]);

  const dismissEpacPollFallback = useCallback(() => setEpacPollFallbackWarning(false), []);

  if (!enabled) return NOOP_RESULT;
  if (!isBleSupported()) return NOOP_RESULT;

  return {
    status,
    bikeState,
    bikeSpeedKmh,
    batteryPercent,
    rangeKm,
    error,
    tripModeSelection,
    connect,
    disconnect,
    setMode,
    setAssist,
    setLight,
    toggleMode,
    cycleTripModeSelection,
    epacPollFallbackWarning,
    dismissEpacPollFallback,
  };
}

export function Super73Provider({
  enabled,
  preferences = DEFAULT_PREFERENCES,
  tracking = DEFAULT_TRACKING_INPUT,
  children,
}: {
  enabled: boolean;
  preferences?: Super73Preferences;
  tracking?: Super73TrackingInput;
  children: ReactNode;
}) {
  const ble = useSuper73Controller(enabled, preferences, tracking);
  return createElement(Super73Context.Provider, { value: ble }, children);
}

export function useSuper73(): UseSuper73Result {
  return useContext(Super73Context);
}

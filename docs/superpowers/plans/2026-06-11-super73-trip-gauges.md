# Super 73 Trip Gauges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encadrer l'indicateur de vitesse du mode trajet de deux jauges à 4 étages (assist à gauche en vert, classe EU à droite en bleu) et afficher dans l'en-tête le % batterie + l'autonomie estimée, toutes deux lues du vélo par BLE.

**Architecture:** Couche données — on parse la trame RIDE (`0x02 0x03`) jusqu'ici jetée pour en tirer `rangeKm` + `batteryPercent` (octet `data[8]`, formule Walker73), exposés par `useSuper73`. Couche UI — deux composants présentationnels (`LevelStack`, `BatteryIndicator`) câblés dans `TrackingDashboard` et `PageHeader`, affichés uniquement quand un Super 73 est connecté.

**Tech Stack:** React 19, TypeScript, Web Bluetooth, Vitest + Testing Library, TailwindCSS v4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-06-11-super73-trip-gauges-design.md`

**Branch:** `feat/super73-trip-gauges` (déjà créée, contient le spec + la maquette).

**Commandes de référence :**

- Tests ciblés : depuis `client/`, `bunx vitest run <chemin>`
- Typecheck : depuis `client/`, `bunx tsc --noEmit`

---

## File Structure

| Fichier                                                      | Responsabilité                                                                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `client/src/lib/super73-ble.ts`                              | (modif) constantes de calibration, `parseRidePacket`, `readRide`, routage `0x02 0x03` du notifier         |
| `client/src/hooks/useSuper73.ts`                             | (modif) état + exposition `batteryPercent`/`rangeKm`, callback notifier + poll 20 s + reset au disconnect |
| `client/src/components/trip/LevelStack.tsx`                  | (création) pile 4 étages présentationnelle                                                                |
| `client/src/components/trip/BatteryIndicator.tsx`            | (création) puce batterie + autonomie                                                                      |
| `client/src/components/trip/TrackingDashboard.tsx`           | (modif) rangée 3 colonnes assist · vitesse · classe                                                       |
| `client/src/components/layout/PageHeader.tsx`                | (modif) slot `center` optionnel                                                                           |
| `client/src/pages/TripPage.tsx`                              | (modif) câblage assist/classe/batterie/autonomie                                                          |
| `client/src/i18n/locales/{en,fr}.ts`                         | (modif) libellés ASSISTANCE / CLASSE                                                                      |
| `client/src/lib/__tests__/super73-ble.test.ts`               | (modif) tests `parseRidePacket` + routage                                                                 |
| `client/src/components/__tests__/LevelStack.test.tsx`        | (création) tests remplissage                                                                              |
| `client/src/components/__tests__/BatteryIndicator.test.tsx`  | (création) tests rendu/masquage                                                                           |
| `client/src/components/__tests__/TrackingDashboard.test.tsx` | (création) test rendu intégré des piles                                                                   |

> **Note e2e :** le rendu Super 73-connecté ne peut pas être testé en Playwright (Web Bluetooth non simulable sans geste utilisateur). La régression du chemin de rendu est couverte par le test vitest `TrackingDashboard.test.tsx` (Task 8). `TripPage` non-connecté reste couvert par `smoke.spec.ts` existant.

---

## Task 1: Décodage RIDE — constantes + `parseRidePacket`

**Files:**

- Modify: `client/src/lib/super73-ble.ts` (ajouter après `parseSpeedPacket`, ~ligne 230)
- Test: `client/src/lib/__tests__/super73-ble.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter dans `client/src/lib/__tests__/super73-ble.test.ts` (et ajouter `parseRidePacket` à la liste d'imports en haut du fichier) :

```ts
describe("parseRidePacket", () => {
  const ride = (raw: number) => {
    const b = new Uint8Array(10);
    b[0] = 0x02;
    b[1] = 0x03;
    b[8] = raw;
    return b;
  };

  it("decodes data[8] to km and battery percent (identity 60/60)", () => {
    expect(parseRidePacket(ride(45))).toEqual({ rangeKm: 45, batteryPercent: 75 });
  });

  it("returns 0/0 for an empty battery", () => {
    expect(parseRidePacket(ride(0))).toEqual({ rangeKm: 0, batteryPercent: 0 });
  });

  it("caps at 100% / max range when raw exceeds the base", () => {
    expect(parseRidePacket(ride(60))).toEqual({ rangeKm: 60, batteryPercent: 100 });
    expect(parseRidePacket(ride(255))).toEqual({ rangeKm: 60, batteryPercent: 100 });
  });

  it("returns null for non-RIDE frames", () => {
    const speed = new Uint8Array([0x02, 0x01, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(parseRidePacket(speed)).toBeNull();
    expect(parseRidePacket(new Uint8Array([0x02, 0x03]))).toBeNull(); // too short
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && bunx vitest run src/lib/__tests__/super73-ble.test.ts`
Expected: FAIL — `parseRidePacket is not a function` / import error.

- [ ] **Step 3: Write minimal implementation**

Dans `client/src/lib/super73-ble.ts`, après la fonction `parseSpeedPacket` :

```ts
/**
 * Battery/range calibration. The bike reports a single raw byte (data[8] of the
 * RIDE frame). With BASE === REAL === 60 the raw byte maps 1:1 to km, matching
 * Walker73's defaults. Recalibrate REAL on a real bike if a model tops out elsewhere.
 */
export const SUPER73_BASE_MAX_RANGE = 60;
export const SUPER73_REAL_MAX_RANGE = 60;

/**
 * Parse a RIDE telemetry packet (byte[0]=0x02, byte[1]=0x03).
 * byte[8] = raw remaining range reported by the bike's computer.
 * Returns null for non-RIDE or truncated frames.
 */
export function parseRidePacket(
  bytes: Uint8Array,
): { rangeKm: number; batteryPercent: number } | null {
  if (bytes.length < 9 || bytes[0] !== 0x02 || bytes[1] !== 0x03) return null;
  const clamped = Math.min(Math.max(bytes[8]!, 0), SUPER73_BASE_MAX_RANGE);
  const ratio = clamped / SUPER73_BASE_MAX_RANGE;
  return {
    rangeKm: ratio * SUPER73_REAL_MAX_RANGE,
    batteryPercent: Math.round(ratio * 100),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && bunx vitest run src/lib/__tests__/super73-ble.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/super73-ble.ts client/src/lib/__tests__/super73-ble.test.ts
git commit -m "feat(super73): decode RIDE battery/range telemetry from data[8]"
```

---

## Task 2: `readRide` + routage notifier `0x02 0x03`

**Files:**

- Modify: `client/src/lib/super73-ble.ts` (ajouter `readRide` après `writeState` ~ligne 219 ; modifier `startStateNotifications` ~lignes 241-270)
- Test: `client/src/lib/__tests__/super73-ble.test.ts`

- [ ] **Step 1: Write the failing test**

Ajouter dans `super73-ble.test.ts` :

```ts
describe("startStateNotifications RIDE routing", () => {
  function makeServer() {
    const listeners: ((e: Event) => void)[] = [];
    const char = {
      startNotifications: vi.fn().mockResolvedValue(undefined),
      addEventListener: (_: string, cb: (e: Event) => void) => listeners.push(cb),
      removeEventListener: vi.fn(),
    };
    const server = {
      getPrimaryService: vi.fn().mockResolvedValue({
        getCharacteristic: vi.fn().mockResolvedValue(char),
      }),
    } as unknown as BluetoothRemoteGATTServer;
    const emit = (bytes: number[]) => {
      const value = { buffer: new Uint8Array(bytes).buffer } as DataView;
      listeners.forEach((cb) => cb({ target: { value } } as unknown as Event));
    };
    return { server, emit };
  }

  it("routes a 0x02 0x03 frame to onRide", async () => {
    const { server, emit } = makeServer();
    const onRide = vi.fn();
    await startStateNotifications(server, vi.fn(), vi.fn(), onRide);
    const frame = new Array(10).fill(0);
    frame[0] = 0x02;
    frame[1] = 0x03;
    frame[8] = 30;
    emit(frame);
    expect(onRide).toHaveBeenCalledWith({ rangeKm: 30, batteryPercent: 50 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && bunx vitest run src/lib/__tests__/super73-ble.test.ts -t "RIDE routing"`
Expected: FAIL — `onRide` not called (4th arg ignored by current signature).

- [ ] **Step 3: Write minimal implementation**

1. Ajouter `readRide` après `writeState` dans `super73-ble.ts` :

```ts
export async function readRide(
  server: BluetoothRemoteGATTServer,
): Promise<{ rangeKm: number; batteryPercent: number } | null> {
  return serializeGatt(async () => {
    const { registerIdChar, registerChar } = await getCharacteristics(server);
    // Select the RIDE register, then read its 10 bytes.
    await withTimeout(registerIdChar.writeValue(new Uint8Array([0x02, 0x03])));
    const value = await withTimeout(registerChar.readValue());
    return parseRidePacket(new Uint8Array(value.buffer));
  });
}
```

2. Modifier la signature et le handler de `startStateNotifications` :

```ts
export async function startStateNotifications(
  server: BluetoothRemoteGATTServer,
  onState: (state: Super73State) => void,
  onSpeed?: (speedKmh: number) => void,
  onRide?: (data: { rangeKm: number; batteryPercent: number }) => void,
): Promise<(() => void) | null> {
  try {
    const service = await withTimeout(server.getPrimaryService(METRICS_SERVICE));
    const char = await withTimeout(service.getCharacteristic(REGISTER_NOTIFIER_CHAR));
    await withTimeout(char.startNotifications());
    const listener = (event: Event) => {
      const c = event.target as BluetoothRemoteGATTCharacteristic;
      if (!c.value) return;
      const bytes = new Uint8Array(c.value.buffer);
      if (bytes[0] === 0x03) {
        try {
          onState(parseStateBytes(bytes, "notifier"));
        } catch {
          // malformed packet — skip
        }
      } else if (bytes[0] === 0x02 && bytes[1] === 0x03) {
        const ride = parseRidePacket(bytes);
        if (ride && onRide) onRide(ride);
      } else if (onSpeed) {
        const speedKmh = parseSpeedPacket(bytes);
        if (speedKmh !== null) onSpeed(speedKmh);
      }
    };
    char.addEventListener("characteristicvaluechanged", listener);
    return () => char.removeEventListener("characteristicvaluechanged", listener);
  } catch {
    return null;
  }
}
```

Mettre aussi à jour le commentaire de doc au-dessus de la fonction pour mentionner `0x02 0x03 → onRide`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && bunx vitest run src/lib/__tests__/super73-ble.test.ts`
Expected: PASS (toute la suite, y compris Task 1).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/super73-ble.ts client/src/lib/__tests__/super73-ble.test.ts
git commit -m "feat(super73): add readRide and route RIDE frames from the notifier"
```

---

## Task 3: `useSuper73` — exposer `batteryPercent` / `rangeKm`

**Files:**

- Modify: `client/src/hooks/useSuper73.ts`
- Test: `client/src/hooks/__tests__/useSuper73.test.tsx`

- [ ] **Step 1: Write the failing test**

Ajouter dans `client/src/hooks/__tests__/useSuper73.test.tsx` un test qui vérifie que le résultat par défaut (non connecté) expose les nouveaux champs à `null`. Reprendre exactement le pattern de montage du hook/contexte déjà présent dans ce fichier pour instancier et lire `result.current` :

```ts
it("exposes null battery telemetry before any RIDE frame", () => {
  // Monter le hook via le même helper/pattern que les autres tests du fichier.
  const { result } = renderUseSuper73();
  expect(result.current.batteryPercent).toBeNull();
  expect(result.current.rangeKm).toBeNull();
});
```

> Si le fichier n'a pas de helper `renderUseSuper73`, copier le pattern de montage existant (provider + `renderHook`) utilisé par les autres `it(...)` du même fichier.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && bunx vitest run src/hooks/__tests__/useSuper73.test.tsx`
Expected: FAIL — `Property 'batteryPercent' does not exist` (typecheck) ou `undefined`.

- [ ] **Step 3: Write minimal implementation**

Dans `client/src/hooks/useSuper73.ts` :

1. Importer `readRide` depuis `../lib/super73-ble` (ajouter à l'import existant qui contient déjà `startStateNotifications`).

2. Ajouter une constante près des autres en haut du fichier :

```ts
// Battery/range change slowly; a low-frequency poll guarantees telemetry even if
// the notifier never pushes RIDE frames on a given firmware.
const RIDE_POLL_INTERVAL_MS = 20_000;
```

3. Étendre l'interface `UseSuper73Result` (après `bikeSpeedKmh`, ~ligne 155) :

```ts
/** Estimated battery percentage (0–100) from the bike's RIDE telemetry. Null until first read. */
batteryPercent: number | null;
/** Estimated remaining range in km from the bike's RIDE telemetry. Null until first read. */
rangeKm: number | null;
```

4. Étendre `NOOP_RESULT` (~ligne 173, après `bikeSpeedKmh: null`) :

```ts
  batteryPercent: null,
  rangeKm: null,
```

5. Ajouter les états dans `useSuper73Controller` (après `bikeSpeedKmh`, ~ligne 198) :

```ts
const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
const [rangeKm, setRangeKm] = useState<number | null>(null);
```

6. Dans `attachDevice` (~ligne 286), passer le callback `onRide` à `startStateNotifications` :

```ts
notifierCleanupRef.current = await startStateNotifications(
  device.gatt!,
  stableNotifierHandler,
  setBikeSpeedKmh,
  (ride) => {
    setBatteryPercent(ride.batteryPercent);
    setRangeKm(ride.rangeKm);
  },
);
```

7. Dans `onDisconnected`, à côté de `setBikeSpeedKmh(null)` (~ligne 321), réinitialiser :

```ts
setBatteryPercent(null);
setRangeKm(null);
```

8. Ajouter un effet de poll RIDE après les autres `useEffect` du controller (par ex. juste après l'effet auto-mode, ~ligne 520) :

```ts
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
```

9. Ajouter `batteryPercent` et `rangeKm` à l'objet retourné par le controller (l'objet qui contient déjà `bikeState`, `bikeSpeedKmh`, ~ligne 427).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && bunx vitest run src/hooks/__tests__/useSuper73.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + Commit**

```bash
cd client && bunx tsc --noEmit && cd ..
git add client/src/hooks/useSuper73.ts client/src/hooks/__tests__/useSuper73.test.tsx
git commit -m "feat(super73): expose batteryPercent and rangeKm from the hook"
```

---

## Task 4: Composant `LevelStack`

**Files:**

- Create: `client/src/components/trip/LevelStack.tsx`
- Test: `client/src/components/__tests__/LevelStack.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LevelStack } from "../trip/LevelStack";

function filledCount(container: HTMLElement): number {
  return container.querySelectorAll('[data-filled="true"]').length;
}

describe("LevelStack", () => {
  it("fills cumulatively from the bottom for level 2", () => {
    const { container } = render(
      <LevelStack level={2} activeColor="bg-primary" label="Assist" ariaLabel="Assist 2/4" />,
    );
    expect(filledCount(container)).toBe(2);
  });

  it("renders no filled cell at level 0", () => {
    const { container } = render(
      <LevelStack level={0} activeColor="bg-primary" label="Assist" ariaLabel="Assist 0/4" />,
    );
    expect(filledCount(container)).toBe(0);
  });

  it("fills all four cells at level 4 (and clamps above)", () => {
    const { container } = render(
      <LevelStack level={9} activeColor="bg-primary" label="Assist" ariaLabel="Assist 4/4" />,
    );
    expect(filledCount(container)).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && bunx vitest run src/components/__tests__/LevelStack.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
interface LevelStackProps {
  /** Active level, 0–4. Values outside the range are clamped. */
  level: number;
  /** Tailwind background class applied to filled cells (e.g. "bg-primary"). */
  activeColor: string;
  /** Short uppercase label shown above the stack. */
  label: string;
  /** Accessible description of the whole stack. */
  ariaLabel: string;
}

const CELLS = [4, 3, 2, 1] as const;

export function LevelStack({ level, activeColor, label, ariaLabel }: LevelStackProps) {
  const clamped = Math.min(Math.max(level, 0), 4);
  return (
    <div className="flex flex-col items-center gap-1.5" role="img" aria-label={ariaLabel}>
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-dim">{label}</span>
      <div className="flex flex-col gap-1">
        {CELLS.map((n) => {
          const filled = clamped >= n;
          return (
            <div
              key={n}
              data-filled={filled}
              aria-hidden
              className={`flex h-7 w-9 items-center justify-center rounded-md text-xs font-bold ${
                filled ? `${activeColor} text-white` : "bg-surface-low/80 text-text-dim"
              }`}
            >
              {n}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && bunx vitest run src/components/__tests__/LevelStack.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/trip/LevelStack.tsx client/src/components/__tests__/LevelStack.test.tsx
git commit -m "feat(trip): add LevelStack 4-step gauge component"
```

---

## Task 5: Composant `BatteryIndicator`

**Files:**

- Create: `client/src/components/trip/BatteryIndicator.tsx`
- Test: `client/src/components/__tests__/BatteryIndicator.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BatteryIndicator } from "../trip/BatteryIndicator";
import { I18nProvider } from "@/i18n/provider";

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);

describe("BatteryIndicator", () => {
  it("shows percent and range when available", () => {
    wrap(<BatteryIndicator percent={75} rangeKm={65} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText(/65/)).toBeInTheDocument();
  });

  it("renders nothing when percent is null", () => {
    const { container } = wrap(<BatteryIndicator percent={null} rangeKm={null} />);
    expect(container.querySelector('[data-testid="battery-indicator"]')).toBeNull();
  });
});
```

> Vérifier le nom exact du provider i18n exporté par `@/i18n/provider` (`grep "export" client/src/i18n/provider.tsx`). Si l'export diffère (ex. `Provider` au lieu de `I18nProvider`), adapter l'import du test. `useT()` est déjà importé depuis ce module dans `PageHeader.tsx`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && bunx vitest run src/components/__tests__/BatteryIndicator.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
import { BatteryMedium, Triangle } from "lucide-react";
import { useT } from "@/i18n/provider";

interface BatteryIndicatorProps {
  /** Estimated battery percentage 0–100, or null when unknown (component hides). */
  percent: number | null;
  /** Estimated remaining range in km, or null. */
  rangeKm: number | null;
}

export function BatteryIndicator({ percent, rangeKm }: BatteryIndicatorProps) {
  const t = useT();
  if (percent == null) return null;
  return (
    <div className="flex flex-col items-center leading-tight" data-testid="battery-indicator">
      <span className="flex items-center gap-1 rounded-md bg-primary/20 px-2 py-0.5 text-sm font-bold text-primary-light">
        <BatteryMedium size={16} aria-hidden />
        {percent}%
      </span>
      {rangeKm != null && (
        <span className="mt-0.5 flex items-center gap-1 text-xs font-medium text-text-dim">
          <Triangle size={10} aria-hidden />
          {rangeKm.toFixed(0)} {t("trip.dashboard.km")}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && bunx vitest run src/components/__tests__/BatteryIndicator.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/trip/BatteryIndicator.tsx client/src/components/__tests__/BatteryIndicator.test.tsx
git commit -m "feat(trip): add BatteryIndicator header chip"
```

---

## Task 6: Slot `center` dans `PageHeader`

**Files:**

- Modify: `client/src/components/layout/PageHeader.tsx`

- [ ] **Step 1: Add the optional center slot**

Dans l'interface `PageHeaderProps`, après `right?: ReactNode;` :

```ts
  /** Slot rendered in the center of the sticky header bar. */
  center?: ReactNode;
```

Dans la signature de déstructuration : `export function PageHeader({ title, subtitle, titleHidden, back, center, right }: PageHeaderProps) {`

Dans le `<header>`, entre le `<div>` de gauche (logo) et le bloc `{right ? ...}` :

```tsx
{
  center ? <div className="flex items-center">{center}</div> : null;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd client && bunx tsc --noEmit`
Expected: PASS (aucune erreur).

- [ ] **Step 3: Commit**

```bash
git add client/src/components/layout/PageHeader.tsx
git commit -m "feat(layout): add optional center slot to PageHeader"
```

---

## Task 7: Libellés i18n ASSISTANCE / CLASSE

**Files:**

- Modify: `client/src/i18n/locales/fr.ts`
- Modify: `client/src/i18n/locales/en.ts`

- [ ] **Step 1: Add keys (FR)**

Dans `client/src/i18n/locales/fr.ts`, à côté des clés `"trip.dashboard.*"` (~ligne 39) :

```ts
  "trip.dashboard.assistLabel": "Assistance",
  "trip.dashboard.classeLabel": "Classe",
```

- [ ] **Step 2: Add keys (EN)**

Dans `client/src/i18n/locales/en.ts`, au même endroit (clés `trip.dashboard.*`) :

```ts
  "trip.dashboard.assistLabel": "Assist",
  "trip.dashboard.classeLabel": "Class",
```

- [ ] **Step 3: Typecheck**

Run: `cd client && bunx tsc --noEmit`
Expected: PASS — les deux locales doivent rester structurellement identiques (le type des clés est partagé). Si le typecheck signale une clé manquante dans l'une des locales, l'ajouter.

- [ ] **Step 4: Commit**

```bash
git add client/src/i18n/locales/fr.ts client/src/i18n/locales/en.ts
git commit -m "feat(i18n): add assist/classe gauge labels"
```

---

## Task 8: `TrackingDashboard` — rangée 3 colonnes

**Files:**

- Modify: `client/src/components/trip/TrackingDashboard.tsx`
- Test: `client/src/components/__tests__/TrackingDashboard.test.tsx`

> **Dépendance :** Task 4 (`LevelStack`) et Task 7 (clés i18n) doivent être faites avant.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrackingDashboard } from "../trip/TrackingDashboard";
import { I18nProvider } from "@/i18n/provider";

const wrap = (ui: React.ReactNode) => render(<I18nProvider>{ui}</I18nProvider>);
const base = {
  isPaused: false,
  speedKmh: 24,
  distance: 0,
  co2Saved: 0,
  elapsed: 0,
  formatTime: () => "00:00",
};

describe("TrackingDashboard", () => {
  it("renders both gauges when assist and classe levels are provided", () => {
    const { container } = wrap(<TrackingDashboard {...base} assistLevel={2} classeLevel={1} />);
    // 2 (assist) + 1 (classe) = 3 filled cells across both stacks
    expect(container.querySelectorAll('[data-filled="true"]').length).toBe(3);
    expect(screen.getByText("24")).toBeInTheDocument();
  });

  it("renders speed only when no levels are provided (unchanged dashboard)", () => {
    const { container } = wrap(<TrackingDashboard {...base} />);
    expect(container.querySelectorAll('[data-filled="true"]').length).toBe(0);
    expect(screen.getByText("24")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && bunx vitest run src/components/__tests__/TrackingDashboard.test.tsx`
Expected: FAIL — props `assistLevel`/`classeLevel` inexistants, aucune cellule rendue.

- [ ] **Step 3: Write minimal implementation**

Remplacer le contenu complet de `client/src/components/trip/TrackingDashboard.tsx` par :

```tsx
import { useT } from "@/i18n/provider";
import { LevelStack } from "./LevelStack";

export interface TrackingDashboardProps {
  isPaused: boolean;
  speedKmh: number | null;
  distance: number;
  co2Saved: number;
  elapsed: number;
  formatTime: (s: number) => string;
  /** Pedal-assist level 0–4 (green gauge). Null/undefined hides the left gauge. */
  assistLevel?: number | null;
  /** Drive-class level 1–4 (blue gauge). Null/undefined hides the right gauge. */
  classeLevel?: number | null;
}

export function TrackingDashboard({
  isPaused,
  speedKmh,
  distance,
  co2Saved,
  elapsed,
  formatTime,
  assistLevel,
  classeLevel,
}: TrackingDashboardProps) {
  const t = useT();

  return (
    <>
      {/* Speed hero, optionally flanked by assist (left) and classe (right) gauges */}
      <div className="flex items-center justify-center gap-4 py-6">
        {assistLevel != null && (
          <LevelStack
            level={assistLevel}
            activeColor="bg-primary"
            label={t("trip.dashboard.assistLabel")}
            ariaLabel={`${t("trip.dashboard.assistLabel")} ${assistLevel}/4`}
          />
        )}

        <div className="flex flex-col items-center">
          {isPaused ? (
            <span
              className="text-5xl font-black tracking-tighter text-warning"
              aria-label={t("trip.dashboard.pausedAria")}
            >
              {t("trip.dashboard.pausedLabel")}
            </span>
          ) : (
            <span className="text-7xl font-black tracking-tighter text-text">
              {speedKmh != null ? speedKmh.toFixed(0) : "—"}
            </span>
          )}
          <span className="text-sm font-bold uppercase tracking-widest text-text-dim">
            {isPaused ? t("trip.dashboard.pausedUnit") : t("trip.dashboard.speedUnit")}
          </span>
        </div>

        {classeLevel != null && (
          <LevelStack
            level={classeLevel}
            activeColor="bg-[#60A5FA]"
            label={t("trip.dashboard.classeLabel")}
            ariaLabel={`${t("trip.dashboard.classeLabel")} ${classeLevel}/4`}
          />
        )}
      </div>

      {/* Distance / CO₂ / Temps — row */}
      <div className="grid grid-cols-3 gap-3 px-6 pb-4">
        <div className="rounded-xl bg-surface-low/80 p-3 text-center backdrop-blur-2xl">
          <span className="block text-2xl font-extrabold tracking-tighter text-text">
            {distance.toFixed(1)}
          </span>
          <span className="text-xs font-bold uppercase text-text-dim">
            {t("trip.dashboard.km")}
          </span>
        </div>
        <div className="rounded-xl bg-surface-low/80 p-3 text-center backdrop-blur-2xl">
          <span className="block text-2xl font-extrabold tracking-tighter text-primary-light">
            {co2Saved.toFixed(1)}
          </span>
          <span className="text-xs font-bold uppercase text-text-dim">
            {t("trip.dashboard.co2Unit")}
          </span>
        </div>
        <div className="rounded-xl bg-surface-low/80 p-3 text-center backdrop-blur-2xl">
          <span className="block text-2xl font-extrabold tracking-tighter text-text">
            {formatTime(elapsed)}
          </span>
          <span className="text-xs font-bold uppercase text-text-dim">
            {t("trip.dashboard.time")}
          </span>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && bunx vitest run src/components/__tests__/TrackingDashboard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/trip/TrackingDashboard.tsx client/src/components/__tests__/TrackingDashboard.test.tsx
git commit -m "feat(trip): flank speed with assist/classe gauges in TrackingDashboard"
```

---

## Task 9: Câblage `TripPage`

**Files:**

- Modify: `client/src/pages/TripPage.tsx`

> **Dépendance :** Tasks 3, 5, 6, 8 doivent être faites avant.

- [ ] **Step 1: Compute levels + pass them down**

1. Ajouter aux imports en haut de `TripPage.tsx` :

```ts
import { modeIndex } from "@/lib/super73-ble";
import { BatteryIndicator } from "@/components/trip/BatteryIndicator";
```

2. Près de `effectiveSpeedKmh` (~ligne 86), dériver les niveaux :

```ts
const s73Connected = ble.status === "connected";
const assistLevel = s73Connected ? (ble.bikeState?.assist ?? null) : null;
const classeLevel = s73Connected && ble.bikeState ? modeIndex(ble.bikeState.mode) + 1 : null;
```

3. Passer les niveaux à `<TrackingDashboard>` (~ligne 358) en ajoutant deux props :

```tsx
<TrackingDashboard
  isPaused={gps.state.isPaused}
  speedKmh={effectiveSpeedKmh}
  distance={distance}
  co2Saved={co2Saved}
  elapsed={elapsed}
  formatTime={formatTime}
  assistLevel={assistLevel}
  classeLevel={classeLevel}
/>
```

4. Ajouter le slot `center` au `<PageHeader>` (~ligne 323), affiché seulement si connecté :

```tsx
<PageHeader
  title={t("trip.header.title")}
  titleHidden
  center={
    s73Connected ? (
      <BatteryIndicator percent={ble.batteryPercent} rangeKm={ble.rangeKm} />
    ) : undefined
  }
  right={
    <GpsStatusBadge
      uiState={uiState}
      gpsAccuracy={gps.state.lastAccuracy}
      idleAccuracy={idleAccuracy}
      isTracking={gps.state.isTracking}
      gpsStatus={gpsStatus}
    />
  }
/>
```

> Réutiliser l'identifiant du hook Super 73 déjà utilisé ligne 86 (`ble.bikeSpeedKmh`). C'est `ble` — l'employer pour `ble.status`, `ble.bikeState`, `ble.batteryPercent`, `ble.rangeKm`.

- [ ] **Step 2: Typecheck**

Run: `cd client && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/TripPage.tsx
git commit -m "feat(trip): wire assist/classe gauges and battery indicator into TripPage"
```

---

## Task 10: Vérification globale + non-régression smoke

**Files:** aucun changement de code (sauf correctifs éventuels).

- [ ] **Step 1: Full unit suite**

Run: `cd client && bunx vitest run`
Expected: PASS — toute la suite, dont les nouveaux tests.

- [ ] **Step 2: Typecheck (client)**

Run: `cd client && bunx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Smoke e2e (non-régression rendu trajet non connecté)**

Run: `cd client && bunx playwright test smoke.spec.ts tracking-layout.spec.ts`
Expected: PASS — TripPage rend sans crash React (Super 73 non connecté → dashboard inchangé). Si Playwright n'est pas installé/headless indisponible en local, noter et laisser la CI le couvrir.

- [ ] **Step 4: Push + PR**

```bash
git push -u origin feat/super73-trip-gauges
```

Puis ouvrir la PR (titre : `feat(super73): trip assist/classe gauges + battery & range`). CI doit passer avant merge.

---

## Self-Review (effectué)

- **Couverture spec :** données RIDE (Task 1-2) ✓ ; exposition hook (Task 3) ✓ ; `LevelStack` cumulatif (Task 4) ✓ ; `BatteryIndicator` masquable (Task 5) ✓ ; slot header (Task 6) ✓ ; libellés i18n (Task 7) ✓ ; mapping `eco→1…race→4` via `modeIndex(mode)+1` (Task 9) ✓ ; affichage conditionnel connecté (Task 9) ✓ ; tests de régression (Tasks 1,2,4,5,8) ✓.
- **Cohérence des types :** `parseRidePacket`/`readRide`/`onRide` renvoient tous `{ rangeKm, batteryPercent }` ; `LevelStack` props `level/activeColor/label/ariaLabel` identiques entre définition (Task 4) et usages (Task 8) ; `TrackingDashboardProps` étendu une seule fois (Task 8) et consommé en Task 9.
- **Pas de placeholder :** chaque étape de code montre le code complet ; les deux vérifications de noms (provider i18n, variable `ble`) sont des contrôles `grep` explicites, pas des TODO de code.
- **Hors périmètre confirmé :** tension/limp/cadence/odomètre non implémentés.

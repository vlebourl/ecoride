# Design — Jauges Super 73 (assist / classe) + batterie & autonomie sur l'écran de trajet

**Date :** 2026-06-11
**Statut :** Validé (design), en attente plan d'implémentation
**Maquette de référence :** `./2026-06-11-super73-trip-gauges-mockup.png`

## Objectif

Sur l'écran de trajet (`TripPage` → `TrackingDashboard`), encadrer l'indicateur de
vitesse de deux jauges verticales à 4 étages, et afficher le niveau de batterie et
l'autonomie estimée du vélo dans l'en-tête. Toutes les données proviennent du vélo
Super 73 via BLE — y compris l'autonomie et le % batterie.

- **Gauche de la vitesse** : pile ASSISTANCE (pedal assist), 4 étages, remplissage
  cumulatif, couleur **verte**.
- **Droite de la vitesse** : pile CLASSE (mode EU), 4 étages, remplissage cumulatif,
  couleur **bleue**.
- **En-tête** : `% batterie` (puce centrale, icône batterie) + `△ autonomie km`.

## Périmètre

Affiché **uniquement** quand `super73Enabled === true` ET BLE `status === "connected"`.
Hors de ce cas, le dashboard actuel reste strictement inchangé. La vitesse conserve son
fallback GPS existant (`ble.bikeSpeedKmh ?? gps.state.speedKmh`).

Hors périmètre : tension batterie, seuil limp 41 V (reposent sur une courbe de décharge
Unity absente du code source Walker73 — non reproductible et inutile ici), cadence/RPM,
odomètre, courant de charge.

## Couche données — décodage batterie & autonomie (BLE)

Source : protocole Comodule (partagé Super 73 / MATE / etc.), identique à celui que notre
code parle déjà. Formule répliquée du code source Walker73 `Assets/BikeState.cs`
(croisé avec `blopker/superduper`, qui ne décode PAS la batterie → Walker73 est l'unique
source).

### Trame RIDE

```
Registre RIDE : data[0]=0x02, data[1]=0x03  (trame de 10 octets)

rawRange = data[8]          // UN SEUL octet (0–255 ; en pratique ~0–60), valeur remontée
                            // par le calculateur du vélo

range_km    = rawRange                       // mapping identité avec les défauts
battery_pct = round(rawRange / 60 × 100)     // clampé 0–100
```

`rawRange` est l'octet 8 (pas un uint16). Walker73 confirme `rawRange = (ushort)data[8]`
— cast sur un seul octet.

### Constantes de calibration (exposées, défauts = identité)

```ts
const SUPER73_BASE_MAX_RANGE = 60; // valeur brute considérée comme "plein" (défaut Walker73)
const SUPER73_REAL_MAX_RANGE = 60; // autonomie réelle correspondante (calibration)
// range_km    = clamp(rawRange, 0, BASE) / BASE * REAL
// battery_pct = clamp01(rawRange / BASE) * 100
```

Avec 60/60, `range_km = rawRange` et `battery_pct = rawRange/60×100` — donnée vélo pure.
Les constantes restent en un seul endroit, commentées « calibrer sur vélo réel si le
modèle culmine à une autre valeur ».

### Acquisition (comme Walker73)

1. Au `connect`, sélectionner une fois le registre RIDE : write `[0x02, 0x03]` sur
   `REGISTER_ID_CHAR` (`1564`) puis read `REGISTER_CHAR` (`155f`) — via la file GATT
   sérialisée existante (`serializeGatt`).
2. Mises à jour continues : router la trame `0x02 0x03` reçue par le notifier
   `155e` (qu'on écoute déjà) au lieu de la jeter.
3. Repli : si aucune trame RIDE n'arrive via le notifier après un délai, re-lecture
   périodique basse fréquence (~20 s) du registre RIDE via `serializeGatt`. La batterie
   évolue lentement ; charge GATT négligeable.

### API exposée

- `super73-ble.ts` :
  - `parseRidePacket(bytes): { rangeKm: number; batteryPercent: number } | null`
    (retourne `null` si `bytes[0]!==0x02 || bytes[1]!==0x03 || bytes.length<9`).
  - `startStateNotifications(...)` reçoit un nouveau callback optionnel
    `onRide?: (data: { rangeKm; batteryPercent }) => void`. Le handler route :
    `0x03` → `onState` ; `0x02 0x01` → `onSpeed` ; `0x02 0x03` → `onRide`.
  - une fonction d'amorçage du registre RIDE (register-select + read).
- `useSuper73.ts` → `UseSuper73Result` gagne :
  - `batteryPercent: number | null`
  - `rangeKm: number | null`
    (null tant qu'aucune trame RIDE n'a été reçue.)

## Couche UI

### `LevelStack` (nouveau composant présentationnel réutilisable)

`client/src/components/trip/LevelStack.tsx`

- Props : `level: number` (0–4), `activeColor: string` (classe Tailwind / token),
  `label: string`, `ariaLabel: string`.
- Rendu : 4 cellules empilées verticalement, numérotées **4,3,2,1** de haut en bas.
- Remplissage **cumulatif depuis le bas** : `level=2` → cellules 1 et 2 colorées, 3 et 4
  éteintes. `level=0` → pile entièrement éteinte.
- Pas d'état interne, pas d'accès BLE. Testable isolément.

### `BatteryIndicator` (nouveau, en-tête)

`client/src/components/trip/BatteryIndicator.tsx`

- Props : `percent: number | null`, `rangeKm: number | null`.
- Rendu : icône batterie + `xx %` (ligne 1), `△ yy km` (ligne 2), centré.
- Si `percent == null` (pas encore de lecture) → composant masqué (rien affiché).

### Intégration

- **`PageHeader`** : ajout d'un slot `center` (optionnel) pour y placer
  `BatteryIndicator`. `TripPage` le fournit seulement si Super 73 connecté + batterie
  disponible.
- **`TrackingDashboard`** : le bloc « Speed — hero central » devient une rangée à 3
  colonnes : `LevelStack` (assist, vert) · vitesse + KM/H · `LevelStack` (classe, bleu).
  Nouveaux props optionnels : `assistLevel?: number | null`, `classeLevel?: number | null`.
  Si absents (Super 73 non connecté), on rend la vitesse seule, centrée, comme aujourd'hui.
- **`TripPage`** : calcule
  - `assistLevel = ble.bikeState?.assist ?? null` (0–4)
  - `classeLevel = ble.bikeState ? modeIndex(ble.bikeState.mode) + 1 : null`
    (`eco→1, tour→2, sport→3, race→4` ; région ignorée, jamais d'étiquette US)
    et les passe à `TrackingDashboard` + `BatteryIndicator` au `PageHeader`.

### Mappings & règles

- **ASSISTANCE** : `level = assist` (0–4). assist=0 → pile vide.
- **CLASSE** : `eco→1, tour→2, sport→3, race→4`. La région (`eu`/`us`) n'affecte PAS
  l'affichage : un vélo en mode US est ramené sur la même échelle 1–4.
- **Pause** : comportement vitesse inchangé (label PAUSE). Les piles figent la dernière
  valeur connue.

## Gestion des erreurs / cas limites

- BLE déconnecté / `super73Enabled=false` → aucune pile, aucune batterie ; dashboard actuel.
- Connecté mais pas encore de trame RIDE → piles affichées (assist/mode déjà connus via
  l'état), batterie masquée jusqu'à la première lecture.
- Trame RIDE malformée (`length < 9`) → ignorée, pas de crash.
- Notifier non supporté par le firmware → repli poll RIDE ; si le poll échoue aussi,
  batterie reste masquée (dégradation gracieuse).

## Tests (régression obligatoire)

On corrige aussi un registre jusque-là mal étiqueté (« odometer/timer » → en réalité RIDE),
donc régression requise par les règles projet.

- **`LevelStack`** (vitest) : `level=2` → exactement 2 cellules pleines + 2 vides ;
  `level=0` → 0 pleine ; `level=4` → 4 pleines. Verrouille la logique de remplissage.
- **`super73-ble` / `parseRidePacket`** (vitest) : trame `0x02 0x03` avec `data[8]=45`
  → `rangeKm=45`, `batteryPercent=75` ; `data[8]=0` → 0/0 ; `data[8]=60` → 60/100 ;
  trame non-RIDE → `null`. Régression sur la télémétrie ajoutée.
- **`useSuper73`** (vitest) : un callback `onRide` simulé met à jour `batteryPercent` /
  `rangeKm` dans le résultat du hook.
- **e2e smoke** (Playwright) : `TripPage` avec état Super 73 stubbé (assist/mode/batterie)
  rend les deux piles + la batterie sans crash React.

## Fichiers touchés

| Fichier                                            | Changement                                                     |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `client/src/lib/super73-ble.ts`                    | `parseRidePacket`, routage `0x02 0x03`, amorçage registre RIDE |
| `client/src/hooks/useSuper73.ts`                   | `batteryPercent`, `rangeKm` dans le résultat + poll repli      |
| `client/src/components/trip/LevelStack.tsx`        | nouveau composant                                              |
| `client/src/components/trip/BatteryIndicator.tsx`  | nouveau composant                                              |
| `client/src/components/trip/TrackingDashboard.tsx` | rangée 3 colonnes                                              |
| `client/src/components/layout/PageHeader.tsx`      | slot `center` optionnel                                        |
| `client/src/pages/TripPage.tsx`                    | câblage assist/classe/batterie/autonomie                       |
| `client/src/i18n/locales/{en,fr}.ts`               | libellés ASSISTANCE / CLASSE / batterie                        |
| tests vitest + e2e                                 | régressions ci-dessus                                          |

# Battery cost per trip and learned range (Super73)

Code: [`client/src/lib/battery-usage.ts`](../../client/src/lib/battery-usage.ts) (method, storage),
[`client/src/hooks/useBatteryUsage.ts`](../../client/src/hooks/useBatteryUsage.ts) (recording),
[`client/src/components/BatteryUsage.tsx`](../../client/src/components/BatteryUsage.tsx) (display).

## What the bike gives us

Protocol v1 (firmware `221122`) sends **no state of charge**. Record `0203`, byte 8, is the
bike's own _estimate_ of its remaining range in whole km — the number on its RANGE screen.
Validated on a real bike: `02 03 00 00 00 00 00 00 39 00` → 57, while the screen showed
57 km (35 mi).

Consequences, all visible in the UI:

- every figure here is derived from an estimate, never from measured energy;
- ecoRide's battery "percent" is `range ÷ 60 km`, not a charge reading — the vehicle page says so;
- a drop is expressed in "km of displayed range", with the derived percent beside it.

Voltage and BMS errors are documented for protocol v2 only: out of scope, as is v2 itself
(`readRide` returns nothing on v2, so no record is ever created).

## Recording a trip

While a trip is tracked **and** the bike is connected with a range reading, the recorder keeps,
for that trip (keyed by its `startedAt`):

| Field                              | Meaning                                              |
| ---------------------------------- | ---------------------------------------------------- |
| `startRangeKm` / `startDistanceKm` | first reading, and the trip distance at that moment  |
| `endRangeKm` / `endDistanceKm`     | latest reading, and the trip distance at that moment |
| `minRangeKm`, `recharged`          | lowest reading seen, and the recharge flag           |

Rules:

1. **Two readings or nothing.** The consumption is `start − end` over the distance _between the
   two readings_. A bike that connects 3 km into the ride, or drops 2 km before the end, yields a
   shorter measured stretch — shown as "measured over X km" — never an extrapolation.
2. **No reading, no record.** Bike never connected, or connected without reporting a range: the
   trip has no battery figure.
3. **No stale reading.** `useSuper73` clears the range on disconnect, so a value is only ever
   used on the connection that read it.
4. **A capped reading cannot start a record.** `parseRidePacket` caps the value at 60, so 60
   means "60 or more". The first reading below 60 starts the record.
5. **Sampling.** One sample per 100 m of trip distance, on every range change, and when the trip
   is paused (the first step of stopping it). The range itself is polled every 20 s.
6. **Minimum stretch: 1 km** between the two readings. Below that a ±1 km reading error is larger
   than the thing measured: no value.

Storage is `localStorage` (`ecoride-battery-trips`, 60 most recent trips), on this device only.
No server column, no migration. The saved trip is matched by the instant of its `startedAt`.

## Learned range

```
km per displayed km = Σ km ridden ÷ Σ km of displayed range lost
learned full range  = 60 × km per displayed km
remaining estimate  = bike's current reading × km per displayed km
```

**A ratio of sums, not a mean of per-trip ratios.** Each reading is a whole km, so a trip's drop
is off by up to ±1 km. On a 2 km trip that is ±50 %; summed over many trips it cancels out, and
each trip weighs in proportion to its distance.

### Which trips count

A trip counts when all of these hold:

- it has two readings at least 1 km apart;
- no recharge was detected;
- its drop is physically plausible: `km/4 − 2 ≤ drop ≤ 4 × km + 2`.

Only the **20 most recent** counted trips are used: a battery ages, and cold weather shortens
range, so old trips should stop weighing.

A short trip whose estimate did not move (drop 0) **counts**. Dropping it would keep only the
short trips where rounding happened to show a drop, and bias the result downwards.

### How much before anything is shown

Both conditions:

- at least **3** counted trips;
- at least **20 km** of displayed range lost across them (a third of a charge).

With three trips the worst-case rounding error is 3 km on 20 (15 %). With more, shorter trips
the worst case is larger, but rounding errors are random and cancel: the typical error stays at
a few percent. Until the threshold is met the vehicle page shows progress ("1/3 trips,
10/20 km"), never a number.

### Recharge

A reading **5 km or more above the lowest reading seen** during the trip flags it as recharged
(or battery swapped). The trip gets no consumption figure and is left out of the learning. A
rise of 1–4 km is treated as the estimate bouncing back, not as a recharge. A recharge between
two trips needs no handling: each trip only uses its own two readings.

### Faulty readings

The plausibility band removes, among others:

- a reading stuck over a long trip (20 km, drop 0) — a frozen record, or a ride without assistance;
- a drop no ride explains (30 displayed km in 2 km) — GPS lost most of the distance.

It is a fixed physical band (real range between a quarter and four times what the bike
displays), not a statistical test: with a handful of trips a median/MAD filter is unstable.

## Known limits — not verified on the bike

These are assumptions. None has been tested on the real bike yet.

1. **Proportionality.** The method assumes the displayed range is proportional to the remaining
   charge. If the bike recomputes it from the riding mode or assist level, changing mode moves
   the reading without using energy.
2. **Full charge = 60.** Taken from Walker73's defaults; the highest value seen on this bike is 57. If the bike reports more than 60 when full, "learned full range" is the range from the
   moment the display reads 60, not from a full battery.
3. **Voltage sag.** If the estimate is voltage-based, a reading under load (end of trip) is lower
   than at rest (start of trip). That overstates the drop, so the learned range errs low.
4. **GPS distance.** Distance comes from GPS, with its own error in both directions (jitter adds
   distance, signal loss removes some). The odometer (record `0202`) would be exact — a
   follow-up once that work lands.
5. **All recorded stretches count**, including a trip abandoned or deleted afterwards: the
   battery was used over that distance either way.

## Not implemented: electricity cost

Nothing in the code or the settings holds a reliable battery capacity (Wh), and the bike does
not report one on v1. Cost = `drop ÷ 60 × capacity × price per kWh` would rest on two assumed
numbers. Follow-up: a "battery capacity (Wh)" and "price per kWh" setting, then the cost per
trip is one line.

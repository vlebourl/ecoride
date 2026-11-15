import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Requirement #1 of the native transport: NEVER request an MTU.
// The Super73 starts its own MTU exchange on connect (→ 247). A second,
// client-initiated exchange (Chrome Android hard-codes requestMtu(517)) is never
// answered, and Android then queues every later ATT request forever (logcat
// 2026-11-15: "bta_gattc_enqueue: Already has a pending command … Queuing for
// later"): even Device Information reads time out. superduper connects with
// `mtu: null`. The bluetooth-le plugin requested 512 on every connect; our bun
// patch removes that code. This test scans the native sources that end up in
// the APK, so a plugin upgrade that silently drops the patch (it is keyed on
// the plugin version) fails here instead of on the bike.

const MTU_REQUEST = /\brequestMtu\s*\(/;
const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

const NATIVE_SOURCE_ROOTS = [
  join(packageDir("@capacitor-community/bluetooth-le"), "android/src"),
  join(packageDir("@capacitor/android"), "capacitor/src/main"),
  resolve(__dirname, "../../../android/app/src/main"),
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(kt|java)$/.test(entry) ? [path] : [];
  });
}

function mtuRequestSites(source: string): number {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && MTU_REQUEST.test(line)).length;
}

describe("native transport never requests an MTU", () => {
  it("detects the call the unpatched plugin makes", () => {
    // Guard on the guard: the plugin's original connect path.
    expect(mtuRequestSites("        requestMtu(REQUEST_MTU)\n")).toBe(1);
    expect(mtuRequestSites("val result = bluetoothGatt?.requestMtu(mtu)")).toBe(1);
    expect(mtuRequestSites("// the requestMtu helper is removed")).toBe(0);
  });

  it.each(NATIVE_SOURCE_ROOTS)("has no requestMtu call under %s", (root) => {
    const files = sourceFiles(root);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((file) => mtuRequestSites(readFileSync(file, "utf8")) > 0);
    expect(offenders).toEqual([]);
  });
});

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { forwardTerminationSignals } from "../../../scripts/process-signals";

describe("production process signals", () => {
  it("forwards SIGTERM to the server child and removes listeners on shutdown", () => {
    const emitter = new EventEmitter();
    const kill = vi.fn();
    const stopForwarding = forwardTerminationSignals({ kill }, emitter);

    emitter.emit("SIGTERM");
    expect(kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");

    stopForwarding();
    emitter.emit("SIGTERM");
    expect(kill).toHaveBeenCalledTimes(1);
  });

  it("forwards SIGINT to the server child", () => {
    const emitter = new EventEmitter();
    const kill = vi.fn();
    const stopForwarding = forwardTerminationSignals({ kill }, emitter);

    emitter.emit("SIGINT");
    expect(kill).toHaveBeenCalledExactlyOnceWith("SIGINT");
    stopForwarding();
  });
});

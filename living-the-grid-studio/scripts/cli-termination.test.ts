import { describe, expect, it } from "vitest";

import {
  CliTerminationError,
  cliExitCode,
  runWithTerminationSignals,
  type SupportedTerminationSignal,
  type TerminationSignalTarget,
} from "./cli-termination";

class FakeSignalTarget implements TerminationSignalTarget {
  private readonly listeners = new Map<
    SupportedTerminationSignal,
    Set<() => void>
  >([
    ["SIGINT", new Set()],
    ["SIGTERM", new Set()],
  ]);

  emit(signal: SupportedTerminationSignal): void {
    for (const listener of this.listeners.get(signal) ?? []) listener();
  }

  listenerCount(signal: SupportedTerminationSignal): number {
    return this.listeners.get(signal)?.size ?? 0;
  }

  off(signal: SupportedTerminationSignal, listener: () => void): void {
    this.listeners.get(signal)?.delete(listener);
  }

  on(signal: SupportedTerminationSignal, listener: () => void): void {
    this.listeners.get(signal)?.add(listener);
  }
}

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}

describe("cooperative CLI termination", () => {
  it("keeps listeners installed until cleanup completes and preserves the first signal", async () => {
    const target = new FakeSignalTarget();
    const cleanupGate = deferred();
    const aborted = deferred();
    const run = runWithTerminationSignals(async (signal) => {
      signal.addEventListener("abort", aborted.resolve, { once: true });
      try {
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
      } finally {
        await cleanupGate.promise;
      }
    }, target);

    expect(target.listenerCount("SIGINT")).toBe(1);
    expect(target.listenerCount("SIGTERM")).toBe(1);
    target.emit("SIGINT");
    await aborted.promise;
    target.emit("SIGTERM");
    expect(target.listenerCount("SIGINT")).toBe(1);
    expect(target.listenerCount("SIGTERM")).toBe(1);
    cleanupGate.resolve();

    const error = await run.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(CliTerminationError);
    expect(cliExitCode(error)).toBe(130);
    expect(target.listenerCount("SIGINT")).toBe(0);
    expect(target.listenerCount("SIGTERM")).toBe(0);
  });

  it("maps SIGTERM through an aggregate cleanup failure without exposing details", async () => {
    const target = new FakeSignalTarget();
    const started = deferred();
    const run = runWithTerminationSignals(async (signal) => {
      started.resolve();
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
      throw new Error("private cleanup detail");
    }, target);
    await started.promise;
    target.emit("SIGTERM");

    const error = await run.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as Error).message).not.toContain("private cleanup detail");
    expect(cliExitCode(error)).toBe(143);
    expect(target.listenerCount("SIGINT")).toBe(0);
    expect(target.listenerCount("SIGTERM")).toBe(0);
  });

  it("removes listeners after success and maps ordinary failures to one", async () => {
    const successTarget = new FakeSignalTarget();
    await expect(
      runWithTerminationSignals(async () => "ok", successTarget),
    ).resolves.toBe("ok");
    expect(successTarget.listenerCount("SIGINT")).toBe(0);
    expect(successTarget.listenerCount("SIGTERM")).toBe(0);

    const failureTarget = new FakeSignalTarget();
    const ordinary = await runWithTerminationSignals(async () => {
      throw new Error("ordinary");
    }, failureTarget).catch((caught: unknown) => caught);
    expect(cliExitCode(ordinary)).toBe(1);
    expect(failureTarget.listenerCount("SIGINT")).toBe(0);
    expect(failureTarget.listenerCount("SIGTERM")).toBe(0);
  });
});

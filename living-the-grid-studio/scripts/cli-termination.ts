export type SupportedTerminationSignal = "SIGINT" | "SIGTERM";

type TerminationListener = () => void;

export interface TerminationSignalTarget {
  off(
    signal: SupportedTerminationSignal,
    listener: TerminationListener,
  ): unknown;
  on(
    signal: SupportedTerminationSignal,
    listener: TerminationListener,
  ): unknown;
}

export class CliTerminationError extends Error {
  readonly exitCode: 130 | 143;
  readonly signal: SupportedTerminationSignal;

  constructor(signal: SupportedTerminationSignal) {
    super("The acceptance run was interrupted.");
    this.name = "CliTerminationError";
    this.signal = signal;
    this.exitCode = signal === "SIGINT" ? 130 : 143;
  }
}

export function throwIfTerminationRequested(
  signal: AbortSignal | undefined,
): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof CliTerminationError) {
    throw signal.reason;
  }
  throw new Error("The acceptance run was interrupted.");
}

export async function runWithTerminationSignals<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  target: TerminationSignalTarget = process,
): Promise<T> {
  const controller = new AbortController();
  const handleSignal = (received: SupportedTerminationSignal): void => {
    if (!controller.signal.aborted) {
      controller.abort(new CliTerminationError(received));
    }
  };
  const onSigint = (): void => handleSignal("SIGINT");
  const onSigterm = (): void => handleSignal("SIGTERM");

  // Persistent listeners intentionally swallow repeated termination signals
  // while the operation owns session, fixture, and browser-profile cleanup.
  // SIGKILL remains the operator's explicit non-cooperative escape hatch.
  target.on("SIGINT", onSigint);
  target.on("SIGTERM", onSigterm);
  try {
    const result = await operation(controller.signal);
    throwIfTerminationRequested(controller.signal);
    return result;
  } catch (error) {
    if (controller.signal.aborted && !containsCliTerminationError(error)) {
      throw new AggregateError(
        [controller.signal.reason, error],
        "The interrupted acceptance run ended with an additional error.",
      );
    }
    throw error;
  } finally {
    target.off("SIGINT", onSigint);
    target.off("SIGTERM", onSigterm);
  }
}

export function cliExitCode(error: unknown): number {
  const termination = findCliTerminationError(error);
  return termination?.exitCode ?? 1;
}

function containsCliTerminationError(error: unknown): boolean {
  return findCliTerminationError(error) !== undefined;
}

function findCliTerminationError(
  error: unknown,
  visited = new Set<unknown>(),
): CliTerminationError | undefined {
  if (error instanceof CliTerminationError) return error;
  if (
    (typeof error !== "object" && typeof error !== "function") ||
    error === null ||
    visited.has(error)
  ) {
    return undefined;
  }
  visited.add(error);
  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      const found = findCliTerminationError(nested, visited);
      if (found) return found;
    }
  }
  if ("cause" in error) {
    return findCliTerminationError(
      (error as { cause?: unknown }).cause,
      visited,
    );
  }
  return undefined;
}

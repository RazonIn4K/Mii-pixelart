import { afterEach, describe, expect, it, vi } from "vitest";

import { readLocalDraft } from "./drafts";

type MockHandler = (() => void) | null;

interface MockRequest {
  error: Error | null;
  onerror: MockHandler;
  onsuccess: MockHandler;
  result: unknown;
}

interface MockTransaction {
  abort: ReturnType<typeof vi.fn>;
  error: Error | null;
  onabort: MockHandler;
  oncomplete: MockHandler;
  onerror: MockHandler;
  objectStore: ReturnType<typeof vi.fn>;
}

interface Harness {
  close: ReturnType<typeof vi.fn>;
  transaction: MockTransaction;
}

interface HarnessOptions {
  operationError?: Error;
  transactionStartError?: Error;
  terminal?: (request: MockRequest, transaction: MockTransaction) => void;
}

function installDatabase(options: HarnessOptions): Harness {
  const request: MockRequest = {
    error: null,
    onerror: null,
    onsuccess: null,
    result: undefined,
  };
  const store = {
    get: vi.fn(() => {
      if (options.operationError) throw options.operationError;
      queueMicrotask(() => options.terminal?.(request, transaction));
      return request as unknown as IDBRequest;
    }),
  };
  const transaction: MockTransaction = {
    abort: vi.fn(),
    error: null,
    onabort: null,
    oncomplete: null,
    onerror: null,
    objectStore: vi.fn(() => store as unknown as IDBObjectStore),
  };
  const close = vi.fn();
  const database = {
    close,
    transaction: vi.fn(() => {
      if (options.transactionStartError) throw options.transactionStartError;
      return transaction as unknown as IDBTransaction;
    }),
  };
  const openRequest = {
    error: null,
    onerror: null as MockHandler,
    onsuccess: null as MockHandler,
    onupgradeneeded: null as MockHandler,
    result: database as unknown as IDBDatabase,
  };

  vi.stubGlobal("indexedDB", {
    open: vi.fn(() => {
      queueMicrotask(() => openRequest.onsuccess?.());
      return openRequest as unknown as IDBOpenDBRequest;
    }),
  });

  return { close, transaction };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local draft IndexedDB lifecycle", () => {
  it("closes after a successful transaction completes", async () => {
    const harness = installDatabase({
      terminal(request, transaction) {
        request.onsuccess?.();
        transaction.oncomplete?.();
      },
    });

    await expect(readLocalDraft()).resolves.toBeNull();
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it("closes and rejects once when a transaction errors and then aborts", async () => {
    const transactionError = new Error("transaction failed");
    const harness = installDatabase({
      terminal(_request, transaction) {
        transaction.error = transactionError;
        transaction.onerror?.();
        transaction.onabort?.();
      },
    });

    await expect(readLocalDraft()).rejects.toBe(transactionError);
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it("closes when a transaction aborts without an IndexedDB error", async () => {
    const harness = installDatabase({
      terminal(_request, transaction) {
        transaction.onabort?.();
      },
    });

    await expect(readLocalDraft()).rejects.toThrow(
      "IndexedDB transaction was aborted.",
    );
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["transaction creation", "transactionStartError"],
    ["request creation", "operationError"],
  ] as const)(
    "closes after a synchronous %s failure",
    async (_label, errorKind) => {
      const expected = new Error(
        `could not create ${_label.replace(" creation", "")}`,
      );
      const options: HarnessOptions = { [errorKind]: expected };
      const harness = installDatabase(options);

      await expect(readLocalDraft()).rejects.toBe(expected);
      expect(harness.close).toHaveBeenCalledTimes(1);
      expect(harness.transaction.abort).toHaveBeenCalledTimes(
        options.operationError ? 1 : 0,
      );
    },
  );
});

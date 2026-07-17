import { afterEach, describe, expect, it, vi } from "vitest";

import { CreateCreationSchema } from "@shared/community";
import {
  clearPendingCloudCreationLease,
  fingerprintCloudCreationPayload,
  getOrCreatePendingCloudCreationLease,
  readLocalDraft,
} from "./drafts";

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

function installLeaseDatabase(
  initial: Record<string, unknown> = {},
): Map<string, unknown> {
  const records = new Map(Object.entries(initial));
  const database = {
    close: vi.fn(),
    objectStoreNames: { contains: () => true },
    transaction: vi.fn(() => {
      let completed = false;
      let pending = 0;
      const transaction = {
        abort: vi.fn(),
        error: null,
        onabort: null as MockHandler,
        oncomplete: null as MockHandler,
        onerror: null as MockHandler,
        objectStore: vi.fn(),
      };
      const completeWhenIdle = () => {
        queueMicrotask(() => {
          if (!completed && pending === 0) {
            completed = true;
            transaction.oncomplete?.();
          }
        });
      };
      const request = <T>(operation: () => T): IDBRequest<T> => {
        pending += 1;
        const next = {
          error: null,
          onerror: null as MockHandler,
          onsuccess: null as MockHandler,
          result: undefined as T,
        };
        queueMicrotask(() => {
          next.result = operation();
          next.onsuccess?.();
          pending -= 1;
          completeWhenIdle();
        });
        return next as unknown as IDBRequest<T>;
      };
      const store = {
        delete: (key: IDBValidKey) =>
          request(() => {
            records.delete(String(key));
            return undefined;
          }),
        get: (key: IDBValidKey) => request(() => records.get(String(key))),
        put: (value: { id: string }) =>
          request(() => {
            records.set(value.id, value);
            return value.id;
          }),
      };
      transaction.objectStore.mockReturnValue(
        store as unknown as IDBObjectStore,
      );
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
  return records;
}

function cloudDocument(name = "Lease test") {
  const timestamp = "2026-07-16T12:00:00.000Z";
  return {
    cells: ["R1C1", ...Array.from({ length: 63 }, () => null)],
    height: 8,
    lockedColors: [],
    meta: { createdAt: timestamp, modifiedAt: timestamp, name },
    usedColors: ["R1C1"],
    version: 1 as const,
    width: 8,
  };
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

describe("pending cloud creation leases", () => {
  it("fingerprints the exact canonical create payload", async () => {
    const raw = cloudDocument();
    const withDiscardedFilename = {
      ...raw,
      meta: { ...raw.meta, sourceImage: "private-filename.png" },
    };
    const canonical = CreateCreationSchema.parse({
      project: raw,
      title: raw.meta.name,
    });
    const canonicalWithDiscardedFilename = CreateCreationSchema.parse({
      project: withDiscardedFilename,
      title: raw.meta.name,
    });
    const fingerprint = await fingerprintCloudCreationPayload(canonical);

    expect(fingerprint).toMatch(/^sha256-v1:[0-9a-f]{64}$/);
    await expect(
      fingerprintCloudCreationPayload(canonicalWithDiscardedFilename),
    ).resolves.toBe(fingerprint);
    await expect(
      fingerprintCloudCreationPayload(
        CreateCreationSchema.parse({
          project: cloudDocument("Changed title"),
          title: "Changed title",
        }),
      ),
    ).resolves.not.toBe(fingerprint);
  });

  it("reuses a UUID only for the same user and draft fingerprint", async () => {
    const records = installLeaseDatabase();
    const fingerprint = `sha256-v1:${"a".repeat(64)}`;
    const first = await getOrCreatePendingCloudCreationLease(
      "lease-user",
      fingerprint,
    );
    const replay = await getOrCreatePendingCloudCreationLease(
      "lease-user",
      fingerprint,
    );

    expect(replay).toEqual(first);
    expect(records.get("pending-cloud-creation:lease-user")).toMatchObject({
      ...first,
      userId: "lease-user",
    });
  });

  it("rotates the UUID for a changed fingerprint or legacy record", async () => {
    const recordId = "pending-cloud-creation:lease-user";
    const records = installLeaseDatabase({
      [recordId]: {
        clientCreationId: "7c06a008-f20c-47f4-802a-ff7e78e3ca45",
        id: recordId,
        updatedAt: 1,
        userId: "lease-user",
      },
    });
    const firstFingerprint = `sha256-v1:${"b".repeat(64)}`;
    const upgraded = await getOrCreatePendingCloudCreationLease(
      "lease-user",
      firstFingerprint,
    );
    expect(upgraded.clientCreationId).not.toBe(
      "7c06a008-f20c-47f4-802a-ff7e78e3ca45",
    );

    const changed = await getOrCreatePendingCloudCreationLease(
      "lease-user",
      `sha256-v1:${"c".repeat(64)}`,
    );
    expect(changed.clientCreationId).not.toBe(upgraded.clientCreationId);
    expect(records.get(recordId)).toMatchObject(changed);
  });

  it("compare-and-deletes only the exact lease", async () => {
    const records = installLeaseDatabase();
    const lease = await getOrCreatePendingCloudCreationLease(
      "lease-user",
      `sha256-v1:${"d".repeat(64)}`,
    );

    await expect(
      clearPendingCloudCreationLease("lease-user", {
        ...lease,
        draftFingerprint: `sha256-v1:${"e".repeat(64)}`,
      }),
    ).resolves.toBe(false);
    expect(records.has("pending-cloud-creation:lease-user")).toBe(true);

    await expect(
      clearPendingCloudCreationLease("lease-user", lease),
    ).resolves.toBe(true);
    expect(records.has("pending-cloud-creation:lease-user")).toBe(false);
  });
});

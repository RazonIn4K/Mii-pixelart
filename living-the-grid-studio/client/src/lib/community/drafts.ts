import type { GridDocument } from "@/lib/engine/grid";
import type { CloudProjectState } from "./types";

const DATABASE_NAME = "tomodachi-studio";
const STORE_NAME = "drafts";
const DATABASE_VERSION = 1;
const RESUME_KEY = "auth-resume";
const PENDING_CLOUD_CREATION_PREFIX = "pending-cloud-creation:";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CLOUD_CREATION_FINGERPRINT_PATTERN = /^sha256-v1:[0-9a-f]{64}$/;

export interface LocalDraft {
  id: string;
  document: GridDocument;
  updatedAt: number;
  cloud?: CloudProjectState;
  resumeAfterAuth?: boolean;
}

interface PendingCloudCreation {
  clientCreationId: string;
  draftFingerprint: string;
  id: string;
  updatedAt: number;
  userId: string;
}

export interface PendingCloudCreationLease {
  clientCreationId: string;
  draftFingerprint: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return await new Promise<T>((resolve, reject) => {
    let request: IDBRequest<T> | undefined;
    let requestResult: T | undefined;
    let requestSucceeded = false;
    let settled = false;
    let transaction: IDBTransaction | undefined;

    const close = () => {
      try {
        database.close();
      } catch {
        // Closing is best-effort after the operation has reached a terminal state.
      }
    };
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      close();
      resolve(requestResult as T);
    };
    const rejectOnce = (error: unknown, fallback: string) => {
      if (settled) return;
      settled = true;
      close();
      reject(error ?? new Error(fallback));
    };

    try {
      transaction = database.transaction(STORE_NAME, mode);
      transaction.oncomplete = () => {
        if (requestSucceeded) {
          resolveOnce();
        } else {
          rejectOnce(
            request?.error,
            "IndexedDB request completed without a result.",
          );
        }
      };
      transaction.onerror = () => {
        rejectOnce(
          transaction?.error ?? request?.error,
          "IndexedDB transaction failed.",
        );
      };
      transaction.onabort = () => {
        rejectOnce(
          transaction?.error ?? request?.error,
          "IndexedDB transaction was aborted.",
        );
      };

      request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => {
        requestResult = request?.result as T;
        requestSucceeded = true;
      };
      request.onerror = () => {
        rejectOnce(
          request?.error ?? transaction?.error,
          "IndexedDB request failed.",
        );
      };
    } catch (error) {
      rejectOnce(error, "Could not start the IndexedDB transaction.");
      try {
        transaction?.abort();
      } catch {
        // The transaction may not have started or may already be inactive.
      }
    }
  });
}

export async function saveLocalDraft(draft: LocalDraft): Promise<void> {
  await withStore("readwrite", (store) => store.put(draft));
}

export async function readLocalDraft(
  id = "current",
): Promise<LocalDraft | null> {
  return (await withStore("readonly", (store) => store.get(id))) ?? null;
}

export async function deleteLocalDraft(id = "current"): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function fingerprintCloudCreationPayload(
  payload: unknown,
): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256-v1:${Array.from(new Uint8Array(digest), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("")}`;
}

export async function getOrCreatePendingCloudCreationLease(
  userId: string,
  draftFingerprint: string,
): Promise<PendingCloudCreationLease> {
  if (!CLOUD_CREATION_FINGERPRINT_PATTERN.test(draftFingerprint)) {
    throw new Error("Cloud retry fingerprint is invalid.");
  }
  const database = await openDatabase();
  const recordId = `${PENDING_CLOUD_CREATION_PREFIX}${userId}`;

  return await new Promise<PendingCloudCreationLease>((resolve, reject) => {
    let lease: PendingCloudCreationLease | undefined;
    let settled = false;
    let transaction: IDBTransaction | undefined;

    const close = () => {
      try {
        database.close();
      } catch {
        // Closing is best-effort after the operation reaches a terminal state.
      }
    };
    const rejectOnce = (error: unknown, fallback: string) => {
      if (settled) return;
      settled = true;
      close();
      reject(error ?? new Error(fallback));
    };

    try {
      transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const read = store.get(recordId);

      transaction.oncomplete = () => {
        if (settled) return;
        if (!lease) {
          rejectOnce(
            undefined,
            "IndexedDB completed without a cloud retry identifier.",
          );
          return;
        }
        settled = true;
        close();
        resolve(lease);
      };
      transaction.onerror = () => {
        rejectOnce(
          transaction?.error ?? read.error,
          "IndexedDB cloud retry transaction failed.",
        );
      };
      transaction.onabort = () => {
        rejectOnce(
          transaction?.error ?? read.error,
          "IndexedDB cloud retry transaction was aborted.",
        );
      };
      read.onerror = () => {
        rejectOnce(
          read.error ?? transaction?.error,
          "Could not read the cloud retry identifier.",
        );
      };
      read.onsuccess = () => {
        const existing = read.result as PendingCloudCreation | undefined;
        if (
          existing?.id === recordId &&
          existing.userId === userId &&
          UUID_V4_PATTERN.test(existing.clientCreationId.toLowerCase()) &&
          existing.draftFingerprint === draftFingerprint
        ) {
          lease = {
            clientCreationId: existing.clientCreationId,
            draftFingerprint,
          };
          return;
        }

        lease = {
          clientCreationId: crypto.randomUUID(),
          draftFingerprint,
        };
        const write = store.put({
          ...lease,
          id: recordId,
          updatedAt: Date.now(),
          userId,
        } satisfies PendingCloudCreation);
        write.onerror = () => {
          rejectOnce(
            write.error ?? transaction?.error,
            "Could not persist the cloud retry identifier.",
          );
        };
      };
    } catch (error) {
      rejectOnce(error, "Could not start the cloud retry transaction.");
      try {
        transaction?.abort();
      } catch {
        // The transaction may not have started or may already be inactive.
      }
    }
  });
}

export async function clearPendingCloudCreationLease(
  userId: string,
  expected: PendingCloudCreationLease,
): Promise<boolean> {
  const database = await openDatabase();
  const recordId = `${PENDING_CLOUD_CREATION_PREFIX}${userId}`;

  return await new Promise<boolean>((resolve, reject) => {
    let cleared = false;
    let settled = false;
    let transaction: IDBTransaction | undefined;

    const close = () => {
      try {
        database.close();
      } catch {
        // Closing is best-effort after the operation reaches a terminal state.
      }
    };
    const rejectOnce = (error: unknown, fallback: string) => {
      if (settled) return;
      settled = true;
      close();
      reject(error ?? new Error(fallback));
    };

    try {
      transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const read = store.get(recordId);

      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        close();
        resolve(cleared);
      };
      transaction.onerror = () => {
        rejectOnce(
          transaction?.error ?? read.error,
          "IndexedDB cloud retry cleanup failed.",
        );
      };
      transaction.onabort = () => {
        rejectOnce(
          transaction?.error ?? read.error,
          "IndexedDB cloud retry cleanup was aborted.",
        );
      };
      read.onerror = () => {
        rejectOnce(
          read.error ?? transaction?.error,
          "Could not read the cloud retry identifier for cleanup.",
        );
      };
      read.onsuccess = () => {
        const existing = read.result as PendingCloudCreation | undefined;
        if (
          existing?.id !== recordId ||
          existing.userId !== userId ||
          existing.clientCreationId !== expected.clientCreationId ||
          existing.draftFingerprint !== expected.draftFingerprint
        ) {
          return;
        }

        const removal = store.delete(recordId);
        removal.onsuccess = () => {
          cleared = true;
        };
        removal.onerror = () => {
          rejectOnce(
            removal.error ?? transaction?.error,
            "Could not clear the cloud retry identifier.",
          );
        };
      };
    } catch (error) {
      rejectOnce(error, "Could not start the cloud retry cleanup transaction.");
      try {
        transaction?.abort();
      } catch {
        // The transaction may not have started or may already be inactive.
      }
    }
  });
}

export async function markDraftForAuthResume(
  document: GridDocument,
): Promise<void> {
  await saveLocalDraft({
    id: RESUME_KEY,
    document,
    updatedAt: Date.now(),
    resumeAfterAuth: true,
  });
}

export async function consumeAuthResumeDraft(): Promise<LocalDraft | null> {
  const draft = await readLocalDraft(RESUME_KEY);
  if (draft) await deleteLocalDraft(RESUME_KEY);
  return draft;
}

export async function hasAuthResumeDraft(): Promise<boolean> {
  return Boolean(await readLocalDraft(RESUME_KEY));
}

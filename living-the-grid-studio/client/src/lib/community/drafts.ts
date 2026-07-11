import type { GridDocument } from "@/lib/engine/grid";
import type { CloudProjectState } from "./types";

const DATABASE_NAME = "tomodachi-studio";
const STORE_NAME = "drafts";
const DATABASE_VERSION = 1;
const RESUME_KEY = "auth-resume";

export interface LocalDraft {
  id: string;
  document: GridDocument;
  updatedAt: number;
  cloud?: CloudProjectState;
  resumeAfterAuth?: boolean;
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
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function saveLocalDraft(draft: LocalDraft): Promise<void> {
  await withStore("readwrite", (store) => store.put(draft));
}

export async function readLocalDraft(id = "current"): Promise<LocalDraft | null> {
  return (await withStore("readonly", (store) => store.get(id))) ?? null;
}

export async function deleteLocalDraft(id = "current"): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function markDraftForAuthResume(document: GridDocument): Promise<void> {
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

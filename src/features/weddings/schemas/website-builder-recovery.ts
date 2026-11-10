export type WebsiteBuilderRecovery = {
  weddingId: string;
  sessionId: string;
  version: number;
  baseDocument: unknown;
  document: unknown;
  savedAt: number;
};

const databaseName = "inviteme-website-builder-recovery";
const storeName = "drafts";
const ttlMs = 24 * 60 * 60 * 1000;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB unavailable")); return; }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) request.result.createObjectStore(storeName, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

const keyOf = (weddingId: string, sessionId: string) => `${weddingId}:${sessionId}`;

export async function readWebsiteBuilderRecovery(weddingId: string, sessionId: string): Promise<WebsiteBuilderRecovery | null> {
  const database = await openDatabase();
  try {
    const value = await new Promise<(WebsiteBuilderRecovery & { key: string }) | undefined>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(keyOf(weddingId, sessionId));
      request.onsuccess = () => resolve(request.result as (WebsiteBuilderRecovery & { key: string }) | undefined);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
    if (!value) return null;
    if (Date.now() - value.savedAt > ttlMs) { await clearWebsiteBuilderRecovery(weddingId, sessionId); return null; }
    return value;
  } finally { database.close(); }
}

export async function writeWebsiteBuilderRecovery(value: WebsiteBuilderRecovery): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).put({
        ...structuredClone(value), key: keyOf(value.weddingId, value.sessionId), savedAt: Date.now(),
      });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("IndexedDB write failed"));
    });
  } finally { database.close(); }
}

export async function clearWebsiteBuilderRecovery(weddingId: string, sessionId: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database.transaction(storeName, "readwrite").objectStore(storeName).delete(keyOf(weddingId, sessionId));
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("IndexedDB delete failed"));
    });
  } finally { database.close(); }
}

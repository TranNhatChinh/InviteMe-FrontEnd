export type StudioBackup = {
  id: string;
  savedAt: number;
  title?: string;
  document: string;
};

type BackupState = { enabled: boolean; entries: StudioBackup[] };

const storeName = "designs";
const retentionMs = 7 * 24 * 60 * 60 * 1000;

export async function updateStudioBackups(
  scope: string,
  update: (state: BackupState) => BackupState = (state) => state,
): Promise<BackupState> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("inviteme-studio-backups", 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<BackupState>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.get(scope);
      let result: BackupState;
      request.onsuccess = () => {
        const stored = request.result as BackupState | undefined;
        result = update({
          enabled: stored?.enabled ?? true,
          entries: (stored?.entries ?? []).filter(
            (entry) => entry.savedAt > Date.now() - retentionMs,
          ),
        });
        store.put(result, scope);
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

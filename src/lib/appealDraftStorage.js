const DB_NAME = "gwe-appeal-drafts";
const STORE_NAME = "files";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser does not support local file draft storage."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open local draft storage."));
  });
}

export async function saveAppealFileDraft(key, file) {
  if (!file) return;
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(file, key);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Unable to save selected proof."));
      transaction.onabort = () => reject(transaction.error || new Error("Saving selected proof was interrupted."));
    });
  } finally {
    db.close();
  }
}

export async function loadAppealFileDraft(key) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Unable to restore selected proof."));
    });
  } finally {
    db.close();
  }
}

export async function clearAppealFileDraft(key) {
  try {
    const db = await openDatabase();
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        transaction.objectStore(STORE_NAME).delete(key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error || new Error("Unable to clear saved proof."));
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("Appeal draft cleanup warning:", error);
  }
}

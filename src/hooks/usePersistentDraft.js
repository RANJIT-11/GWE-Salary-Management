
import { useEffect, useState } from "react";

export default function usePersistentDraft(key, initialValue) {
  const storageKey = `gwe_draft_${key}`;

  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);

      return saved !== null
        ? JSON.parse(saved)
        : initialValue;
    } catch (error) {
      console.error("Draft restore error:", error);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (error) {
      console.error("Draft save error:", error);
    }
  }, [storageKey, value]);

  const clearDraft = () => {
    localStorage.removeItem(storageKey);
    setValue(initialValue);
  };

  return [value, setValue, clearDraft];
}

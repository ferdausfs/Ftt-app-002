import { useState, useCallback } from 'react';

/**
 * Generic localStorage-backed state hook. Survives across sessions;
 * falls back to the default when storage is unavailable (SSR/incognito).
 */
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue(prev => {
        const resolved = typeof next === 'function' ? (next as (prev: T) => T)(prev) : next;
        try { localStorage.setItem(key, JSON.stringify(resolved)); } catch { /* quota/private */ }
        return resolved;
      });
    },
    [key],
  );

  return [value, set];
}

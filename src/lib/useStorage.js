import { useState, useCallback } from 'react';
import { getStore, setStore } from './storage.js';

/**
 * Reactive in-memory app-data hook. Persisted records are loaded from the API.
 * const [data, save, refresh] = useStorage(KEYS.PATIENTS)
 */
export function useStorage(key, defaultValue = []) {
  const [data, setData] = useState(() => getStore(key, defaultValue));

  const refresh = useCallback(() => {
    setData(getStore(key, defaultValue));
  }, [key]);

  const save = useCallback((newData) => {
    setStore(key, newData);
    setData(newData);
  }, [key]);

  return [data, save, refresh];
}

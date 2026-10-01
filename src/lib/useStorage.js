import { useState, useCallback } from 'react';
import { getStore, setStore } from './storage.js';

/**
 * Reactive LocalStorage hook.
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

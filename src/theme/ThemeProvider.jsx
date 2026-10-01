import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  applyTheme,
  DEFAULT_PREFS,
  loadPrefs,
  savePrefs,
  resolveMode,
} from "./themePrefs.js";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [prefs, setPrefsState] = useState(() => loadPrefs());

  useEffect(() => {
    applyTheme(prefs);
  }, [prefs]);

  useEffect(() => {
    if (prefs.mode !== "system") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme(prefs);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [prefs]);

  const value = useMemo(() => {
    const updatePrefs = (patch) => {
      setPrefsState((current) => {
        const next = { ...current, ...patch };
        savePrefs(next);
        applyTheme(next);
        return next;
      });
    };
    return {
      prefs,
      updatePrefs,
      resolvedMode: resolveMode(prefs.mode),
      resetPrefs: () => {
        savePrefs(DEFAULT_PREFS);
        applyTheme(DEFAULT_PREFS);
        setPrefsState({ ...DEFAULT_PREFS });
      },
    };
  }, [prefs]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      prefs: DEFAULT_PREFS,
      updatePrefs: () => {},
      resolvedMode: "light",
      resetPrefs: () => {},
    };
  }
  return ctx;
}

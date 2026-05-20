import { useEffect, useRef, useState } from "react";

/**
 * Lightweight client-side autosave for forms (drafts persist to localStorage).
 * Non-destructive — never writes to the database. Pair with an explicit
 * "Save" mutation for the real persistence step.
 *
 * Usage:
 *   const { restored, clear } = useAutosave("invoice-draft-" + id, formState, setFormState);
 */
export function useAutosave<T>(
  key: string,
  value: T,
  setValue: (v: T) => void,
  debounceMs = 800,
) {
  const [restored, setRestored] = useState(false);
  const firstRun = useRef(true);

  // Restore on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          setValue(parsed as T);
          setRestored(true);
        }
      }
    } catch { /* ignore corrupt drafts */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Debounced save
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const h = setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
    }, debounceMs);
    return () => clearTimeout(h);
  }, [key, value, debounceMs]);

  const clear = () => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    setRestored(false);
  };

  return { restored, clear };
}

/**
 * UI-only store for partial payment amounts.
 *
 * Strict separation of concerns:
 *  - service_orders is the immutable source of truth (we never write to it).
 *  - payment_orders / financial_entries are NOT used by the financial engine.
 *  - When an OS has status='partial', the user can record a partial amount
 *    HERE (Financial UI). It's persisted in localStorage and never touches
 *    the database.
 *
 * Shape: { [serviceOrderId]: number }
 */
const KEY = "qwork.financial.partialPayments.v1";

type Store = Record<string, number>;
type Listener = (store: Store) => void;

const listeners = new Set<Listener>();

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore quota errors */
  }
  listeners.forEach((l) => l(store));
}

export const partialPaymentsStore = {
  getAll(): Store {
    return read();
  },
  get(serviceOrderId: string): number {
    return read()[serviceOrderId] ?? 0;
  },
  set(serviceOrderId: string, amount: number) {
    const cur = read();
    if (!amount || amount <= 0) {
      delete cur[serviceOrderId];
    } else {
      cur[serviceOrderId] = amount;
    }
    write(cur);
  },
  clear(serviceOrderId: string) {
    const cur = read();
    delete cur[serviceOrderId];
    write(cur);
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// Cross-tab sync
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      listeners.forEach((l) => l(read()));
    }
  });
}

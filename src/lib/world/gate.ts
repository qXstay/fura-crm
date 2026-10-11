// Ворота между действиями посетителей и пересборкой мира в одном процессе.
// Действия проходят толпой; пересборка закрывает ворота для новых действий, ждёт, пока текущие закончатся
// (не дольше DRAIN_MS), собирает мир и открывает ворота. Так пересборка не сталкивается в базе
// с транзакцией посетителя, которая держит одну таблицу и ждёт другую.

const DRAIN_MS = 10_000;

type Gate = { active: number; closed: Promise<void> | null; drained: (() => void) | null };
type G = typeof globalThis & { __furaGate?: Gate };

function gate(): Gate {
  const g = globalThis as G;
  return (g.__furaGate ??= { active: 0, closed: null, drained: null });
}

/** Действие посетителя: ждёт, если идёт пересборка */
export async function asVisitor<T>(fn: () => Promise<T>): Promise<T> {
  const g = gate();
  while (g.closed) await g.closed;
  g.active++;
  try {
    return await fn();
  } finally {
    g.active--;
    if (g.active === 0) g.drained?.();
  }
}

/** Пересборка: одна за раз, после того как текущие действия закончились */
export async function exclusively<T>(fn: () => Promise<T>): Promise<T> {
  const g = gate();
  while (g.closed) await g.closed;
  let open!: () => void;
  g.closed = new Promise<void>((r) => (open = r));
  try {
    if (g.active > 0) {
      await new Promise<void>((r) => {
        g.drained = r;
        setTimeout(r, DRAIN_MS).unref?.();
      });
    }
    return await fn();
  } finally {
    g.drained = null;
    g.closed = null;
    open();
  }
}

// Когда посетитель последний раз что-то делал: открывал страницы, нажимал, сохранял.
// Живёт в памяти процесса (globalThis общий для всех частей сервера Next), после перезапуска пусто.

type G = typeof globalThis & { __furaActivity?: number };

export function markActivity(at = Date.now()) {
  const g = globalThis as G;
  if (!g.__furaActivity || g.__furaActivity < at) g.__furaActivity = at;
}

export function lastActivity(): number | null {
  return (globalThis as G).__furaActivity ?? null;
}

/** Конфликт блокировок в базе: взаимная блокировка, конфликт сериализации или занятая таблица (lock_timeout) */
export function isLockConflict(e: unknown): boolean {
  const code = (e as { code?: string })?.code;
  return code === "P2034" || /40P01|40001|55P03|deadlock detected|could not serialize|lock timeout/i.test(String((e as Error)?.message ?? e));
}

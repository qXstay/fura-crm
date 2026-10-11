import { prisma } from "../db";
import { addDays, bizMoment, bizParts } from "../time";
import { buildWorld } from "./build";
import { count } from "../money";
import { lastActivity } from "./activity";

// «Автопилот» мира демо:
// - каждый день в 6:00 по Москве;
// - тихо после 20 минут без изменений;
// - не реже чем раз в 6 часов, даже если в демо всё время кто-то есть;
// - по кнопке «Начать заново».
// Если посетитель прямо сейчас что-то делает, плановая пересборка ждёт 5 минут тишины, но не дольше 30 минут.
// Сборка идёт одной транзакцией под блокировкой в базе: одновременно только одна, оборванная откатывается целиком.

export const IDLE_REBUILD_MS = 20 * 60_000;
export const CEILING_MS = 6 * 3600_000;
export const QUIET_MS = 5 * 60_000;
export const MAX_WAIT_MS = 30 * 60_000;
export const DAILY_HOUR = 6;

export type RebuildReason = "missing" | "daily" | "idle" | "ceiling" | "manual";
export type WorldStateLite = { builtAt?: Date | null; builtFor: string; dirty: boolean; lastChangeAt: Date | null };

/** Какая пересборка назрела и с какого момента (без учёта посетителей) */
export function rebuildDue(state: WorldStateLite | null, now: Date = new Date()): { reason: RebuildReason; dueAt: number } | null {
  if (!state) return { reason: "missing", dueAt: now.getTime() };
  const p = bizParts(now);
  const due: { reason: RebuildReason; dueAt: number }[] = [];
  if (state.builtFor !== p.date) {
    // Новый день наступает в 6:00 по Москве; мир старше вчерашнего пересобираем в любой час
    if (p.hour >= DAILY_HOUR) due.push({ reason: "daily", dueAt: bizMoment(p.date, DAILY_HOUR).getTime() });
    else if (state.builtFor < addDays(p.date, -1)) due.push({ reason: "daily", dueAt: now.getTime() });
  }
  if (state.builtAt && now.getTime() - state.builtAt.getTime() >= CEILING_MS) due.push({ reason: "ceiling", dueAt: state.builtAt.getTime() + CEILING_MS });
  if (state.dirty && state.lastChangeAt && now.getTime() - state.lastChangeAt.getTime() > IDLE_REBUILD_MS) due.push({ reason: "idle", dueAt: state.lastChangeAt.getTime() + IDLE_REBUILD_MS });
  if (!due.length) return null;
  return due.sort((a, b) => a.dueAt - b.dueAt)[0];
}

/** Нужна ли пересборка прямо сейчас. lastActivityAt: когда посетитель последний раз что-то делал. */
export function rebuildReason(state: WorldStateLite | null, now: Date = new Date(), lastActivityAt: number | null = null): RebuildReason | null {
  const due = rebuildDue(state, now);
  if (!due) return null;
  if (due.reason === "missing") return "missing";
  const busySince = Math.max(lastActivityAt ?? 0, state?.lastChangeAt?.getTime() ?? 0);
  const busy = busySince > 0 && now.getTime() - busySince < QUIET_MS;
  // посетитель что-то делает: ждём 5 минут тишины, но не дольше 30 минут от назначенного времени
  if (busy && now.getTime() - due.dueAt < MAX_WAIT_MS) return null;
  return due.reason;
}

let running: Promise<unknown> | null = null;

/**
 * Пересобрать мир. expectBuiltAt: какой мир видели, когда решили пересобирать.
 * Если за это время его уже пересобрал кто-то другой, второй раз не собираем.
 */
export async function rebuild(reason: RebuildReason, expectBuiltAt?: Date | null) {
  if (running) {
    await running.catch(() => {});
    if (reason !== "manual") return null;
  }
  const p = buildWorld(prisma, new Date(), { expectBuiltAt: reason === "manual" ? undefined : expectBuiltAt });
  running = p;
  try {
    const r = await p;
    if (r) console.log(`[мир] пересборка (${reason}): ${r.ms} мс, ${count(r.orders, "order")}`);
    return r;
  } finally {
    running = null;
  }
}

/** Проверить и при необходимости пересобрать */
export async function ensureWorld(now: Date = new Date()) {
  let state = null;
  try {
    state = await prisma.worldState.findUnique({ where: { id: 1 } });
  } catch {
    state = null;
  }
  const reason = rebuildReason(state, now, lastActivity());
  if (reason) await rebuild(reason, state?.builtAt ?? null);
}

type G = typeof globalThis & { __furaScheduler?: ReturnType<typeof setInterval> };

export function startScheduler() {
  const g = globalThis as G;
  if (g.__furaScheduler) return;
  const tick = () => ensureWorld().catch((e) => console.error("[мир] ошибка пересборки", e));
  setTimeout(tick, 1500);
  g.__furaScheduler = setInterval(tick, 60_000);
  g.__furaScheduler.unref?.();
}

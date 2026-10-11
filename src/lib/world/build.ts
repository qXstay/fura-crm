import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";
import { generateWorld } from "./generate";
import { isLockConflict } from "./locks";
import { exclusively } from "./gate";

export { isLockConflict };

let hashCache: { pw: string; hash: string } | null = null;

function demoHash(): string {
  const pw = process.env.DEMO_PASSWORD;
  if (!pw) throw new Error("DEMO_PASSWORD не задан в .env");
  if (hashCache?.pw !== pw) hashCache = { pw, hash: bcrypt.hashSync(pw, 10) };
  return hashCache.hash;
}

const WORLD_TABLES = [
  "AuditLog",
  "Document",
  "Order",
  "Trip",
  "Client",
  "Route",
  "User",
  "Person",
  "Vehicle",
  "Entity",
  "Counter",
  "WorldState",
];

/** Сколько сессий храним самое большее: старые входы удаляются при пересборке */
export const MAX_SESSIONS = 2000;
const WORLD_LOCK = 424242;

/**
 * Полная пересборка мира демо одной транзакцией.
 * Блокировка в базе держится до конца транзакции: одновременно идёт только одна сборка,
 * оборванная (перезапуск контейнера, ошибка) откатывается целиком, старый мир остаётся.
 * expectBuiltAt: если задан и мир уже пересобран кем-то другим, ничего не делаем и возвращаем null.
 * Сессии не удаляем: id пользователей постоянные, вход не слетает.
 */
export async function buildWorld(prisma: PrismaClient, now: Date = new Date(), opts: { expectBuiltAt?: Date | null } = {}) {
  return exclusively(() => buildWorldNow(prisma, now, opts));
}

async function buildWorldNow(prisma: PrismaClient, now: Date, opts: { expectBuiltAt?: Date | null }) {
  const w = generateWorld(now);
  const passwordHash = demoHash();
  const started = Date.now();
  /** lockMs = 0: взять таблицы без ожидания, иначе ждать не дольше lockMs */
  const attempt = (lockMs: number) => prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${WORLD_LOCK})`);
      if (opts.expectBuiltAt !== undefined) {
        const s = await tx.worldState.findUnique({ where: { id: 1 }, select: { builtAt: true } });
        if ((s?.builtAt?.getTime() ?? null) !== (opts.expectBuiltAt?.getTime() ?? null)) return false;
      }
      // Все таблицы мира берём разом и не ждём: если посетитель как раз что-то сохраняет, отступаем и пробуем снова.
      // Так сборка никогда не ждёт, держа часть таблиц, и взаимной блокировки с действием посетителя не бывает.
      if (lockMs === 0) await tx.$executeRawUnsafe(`LOCK TABLE ${WORLD_TABLES.map((t) => `"${t}"`).join(", ")} IN ACCESS EXCLUSIVE MODE NOWAIT`);
      else {
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '${lockMs}ms'`);
        await tx.$executeRawUnsafe(`LOCK TABLE ${WORLD_TABLES.map((t) => `"${t}"`).join(", ")} IN ACCESS EXCLUSIVE MODE`);
        await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = 0`);
      }
      await tx.$executeRawUnsafe(`TRUNCATE ${WORLD_TABLES.map((t) => `"${t}"`).join(", ")} CASCADE`);
      await tx.entity.createMany({ data: w.entities });
      await tx.vehicle.createMany({ data: w.vehicles });
      await tx.person.createMany({ data: w.persons });
      await tx.user.createMany({ data: w.users.map((u) => ({ ...u, passwordHash })) });
      await tx.route.createMany({ data: w.routes });
      await tx.client.createMany({ data: w.clients });
      await tx.trip.createMany({ data: w.trips });
      await tx.order.createMany({ data: w.orders });
      await tx.document.createMany({ data: w.documents });
      // тарифы, оплаты и касса: в публичную часть не входят
      await tx.auditLog.createMany({ data: w.audit });
      await tx.counter.createMany({ data: w.counters });
      await tx.worldState.create({ data: { id: 1, builtAt: now, builtFor: w.builtFor, dirty: false, lastChangeAt: null } });
      // база не растёт: истёкшие входы удаляются, живых не больше MAX_SESSIONS
      await tx.session.deleteMany({ where: { expiresAt: { lt: now } } });
      await tx.$executeRawUnsafe(`DELETE FROM "Session" WHERE id IN (SELECT id FROM "Session" ORDER BY "createdAt" DESC OFFSET ${MAX_SESSIONS})`);
      return true;
    },
    { timeout: 60_000, maxWait: 60_000 },
  );
  // Таблицы заняты действием посетителя: сразу отступаем (NOWAIT, ничего не держим) и через миг пробуем снова.
  // Действия посетителей длятся миллисекунды, обычно хватает первых попыток. Если демо очень занято
  // дольше 15 секунд, сборка встаёт в очередь за таблицами с ожиданием до 5 секунд.
  let done: boolean | undefined;
  const until = Date.now() + 15_000;
  for (let n = 1; ; n++) {
    const patient = Date.now() > until;
    try {
      done = await attempt(patient ? 5000 : 0);
      break;
    } catch (e) {
      if (!isLockConflict(e) || (patient && n > 400)) throw e;
      await new Promise((r) => setTimeout(r, 15 + Math.random() * 40));
    }
  }
  if (!done) return null;
  return { ms: Date.now() - started, orders: w.orders.length, trips: w.trips.length, builtFor: w.builtFor };
}

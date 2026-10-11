import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildWorld } from "@/lib/world/build";
import { addOrdersToTrip, removeOrderFromTrip } from "@/lib/domain/trips";
import { createOrder } from "@/lib/domain/orders";
import { isLockConflict } from "@/lib/world/locks";
import { asVisitor } from "@/lib/world/gate";
import { ActionError } from "@/lib/errors";
import { actor, freshWorld, orderInput, prisma } from "./helpers";

// «Автопилот»: пересборка атомарная, одна за раз, переживает обрыв и не раздувает базу

const dbSize = async () => Number((await prisma.$queryRaw<{ s: bigint }[]>`SELECT pg_database_size(current_database()) AS s`)[0].s);

describe("автопилот мира", () => {
  it("две пересборки сразу: собирает одна, вторая видит свежий мир и ничего не делает", async () => {
    await freshWorld();
    const seen = (await prisma.worldState.findUniqueOrThrow({ where: { id: 1 } })).builtAt;
    const [a, b] = await Promise.all([buildWorld(prisma, new Date(), { expectBuiltAt: seen }), buildWorld(prisma, new Date(), { expectBuiltAt: seen })]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await prisma.worldState.count()).toBe(1);
  });

  it("пересборка, оборванная посреди работы, откатывается целиком: старый мир цел", async () => {
    await freshWorld();
    const before = { orders: await prisma.order.count(), clients: await prisma.client.count(), state: await prisma.worldState.findUniqueOrThrow({ where: { id: 1 } }) };
    // настоящая пересборка в отдельном процессе, как в контейнере
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/build-world.ts"], { env: { ...process.env }, stdio: "ignore" });
    // ждём, пока она возьмёт блокировку и начнёт писать, и «роняем контейнер»
    let caught = false;
    for (let i = 0; i < 1500 && !caught; i++) {
      const held = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND objid = 424242 AND granted`;
      if (Number(held[0].n) > 0) caught = true;
      else await new Promise((r) => setTimeout(r, 10));
    }
    expect(caught).toBe(true);
    await new Promise((r) => setTimeout(r, 120));
    child.kill("SIGKILL");
    await new Promise((r) => child.on("exit", r));
    // база сама откатывает незавершённую транзакцию, как только соединение рвётся; ждём, пока блокировка уйдёт
    for (let i = 0; i < 100; i++) {
      const held = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_locks WHERE locktype = 'advisory' AND objid = 424242`;
      if (Number(held[0].n) === 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const state = await prisma.worldState.findUniqueOrThrow({ where: { id: 1 } });
    const rolledBack = state.builtAt.getTime() === before.state.builtAt.getTime();
    console.log(`[автопилот] обрыв сборки: ${rolledBack ? "транзакция откатилась, старый мир на месте" : "сборка успела закончиться до обрыва"}`);
    if (rolledBack) {
      // оборвали посреди: старый мир целиком на месте
      expect(await prisma.order.count()).toBe(before.orders);
      expect(await prisma.client.count()).toBe(before.clients);
    }
    // в любом случае мир целый, не наполовину пустой
    expect(await prisma.order.count()).toBeGreaterThan(100);
    expect(await prisma.user.count()).toBe(4);
    // следующая пересборка проходит как обычно
    const r = await buildWorld(prisma, new Date());
    expect(r?.orders).toBeGreaterThan(100);
  }, 60_000);

  it("пересборки посреди действий посетителей не падают: столкновения блокировок повторяются", async () => {
    await freshWorld();
    let stop = false;
    const conflicts = { visitor: 0, other: 0, broken: 0 };
    const visitor = async (k: number) => {
      while (!stop) {
        try {
          // как в настоящем действии: через ворота (их ставит обёртка серверных действий)
          await asVisitor(async () => {
          const m = await actor("MANAGER");
          const free = await prisma.order.findFirst({ where: { tripId: null, routeId: "r-mow-msq", status: "ACCEPTED", pallets: 1 } });
          if (free) {
            await addOrdersToTrip(m, "trip-now-loading", [free.id]);
            await removeOrderFromTrip(m, "trip-now-loading", free.id);
          }
          await createOrder(m, orderInput({ cargo: `Груз ${k}`, pallets: 1, places: 1, weightKg: 100, volumeM3: 1 }));
          });
        } catch (e) {
          // посреди пересборки действие посетителя может не пройти: мир под ним уже другой
          if (isLockConflict(e)) conflicts.visitor++;
          else {
            conflicts.other++;
            // отказы по делу («этой заявки нет в рейсе» при гонке двух посетителей) нормальны; падений базы быть не должно
            if (!(e instanceof ActionError)) {
              conflicts.broken++;
              console.log("[автопилот] сбой у посетителя:", String((e as Error).message).slice(0, 160));
            }
          }
        }
        await new Promise((r) => setTimeout(r, 10));
      }
    };
    const loops = Array.from({ length: 6 }, (_, k) => visitor(k));
    const results = [];
    try {
      for (let i = 0; i < 8; i++) results.push(await buildWorld(prisma, new Date()));
    } finally {
      stop = true;
      await Promise.all(loops);
    }
    expect(results.every((r) => r && r.orders > 100)).toBe(true);
    expect(conflicts.broken).toBe(0);
    console.log(`[автопилот] 8 пересборок под 6 посетителями: все прошли; у посетителей столкновений ${conflicts.visitor}, отказов по делу ${conflicts.other}, сбоев ${conflicts.broken}`);
  }, 120_000);

  it("истёкшие и лишние сессии удаляются при пересборке", async () => {
    await freshWorld();
    await prisma.session.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({ id: `old-${i}`, userId: "u-owner", expiresAt: new Date(Date.now() - 1000) })),
    });
    await prisma.session.create({ data: { id: "live", userId: "u-owner", expiresAt: new Date(Date.now() + 86400_000) } });
    await buildWorld(prisma, new Date());
    expect(await prisma.session.count({ where: { id: { startsWith: "old-" } } })).toBe(0);
    // живой вход остаётся
    expect(await prisma.session.count({ where: { id: "live" } })).toBe(1);
    await prisma.session.deleteMany({ where: { id: "live" } });
  });

  it("50 пересборок подряд: база не растёт", async () => {
    await freshWorld();
    await prisma.$executeRawUnsafe("VACUUM");
    const start = await dbSize();
    const sizes: number[] = [];
    for (let i = 0; i < 50; i++) {
      await buildWorld(prisma, new Date());
      if (i % 10 === 9) sizes.push(await dbSize());
    }
    const growth = sizes[sizes.length - 1] - start;
    console.log(`[автопилот] база до ${(start / 1048576).toFixed(1)} МБ, после 50 пересборок ${(sizes[sizes.length - 1] / 1048576).toFixed(1)} МБ, по пути ${sizes.map((s) => (s / 1048576).toFixed(1)).join(" / ")}`);
    // мир весит несколько МБ; после 50 сборок не больше чем на 2 МБ сверху
    expect(growth).toBeLessThan(2 * 1048576);
  }, 240_000);
});

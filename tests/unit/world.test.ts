import { describe, expect, it } from "vitest";
import { addReason, bodyFits, loadOf, overloaded, palletPlaces, type AddOrder, type BodyCode } from "@/lib/freight";
import { generateWorld, tripLoadCheck, type WorldData } from "@/lib/world/generate";
import { CEILING_MS, MAX_WAIT_MS, QUIET_MS, rebuildReason } from "@/lib/world/scheduler";
import { addDays, bizMoment } from "@/lib/time";

const DATES: [string, Date][] = [
  ["9 октября 2026, утро", new Date("2026-10-09T06:30:00Z")],
  ["через 6 месяцев", new Date("2027-04-09T12:00:00Z")],
  ["через 12 месяцев", new Date("2027-10-09T15:00:00Z")],
  ["31 декабря, вечер", new Date("2026-12-31T18:00:00Z")],
  ["1 января, ночь", new Date("2026-12-31T22:30:00Z")],
];

const vehicles = (w: WorldData) => Object.fromEntries(w.vehicles.map((v) => [v.id, v as unknown as { body: BodyCode; capacityKg: number; volumeM3: number; pallets: number }]));
const tripOrders = (w: WorldData, id: string) => w.orders.filter((o) => o.tripId === id) as unknown as (AddOrder & { status: string })[];

describe.each(DATES)("мир на дату: %s", (_label, now) => {
  const w = generateWorld(now);
  const V = vehicles(w);

  it("одна компания, рубли, пять машин", () => {
    expect(w.entities).toHaveLength(1);
    expect(w.vehicles).toHaveLength(5);
    expect(JSON.stringify(w)).not.toMatch(/BYN|нет доступа/);
  });

  it("ни один рейс не перегружен по весу, объёму и палетам, кузов подходит каждому грузу", () => {
    for (const c of tripLoadCheck(w)) expect(c.over, c.tripId).toBe(false);
    for (const t of w.trips) {
      const v = V[t.vehicleId as string];
      for (const o of tripOrders(w, t.id)) expect(bodyFits(o, v), `${t.id} ${o.body} ${o.loading}`).toBe(true);
      // отдельная машина едет одна
      const list = tripOrders(w, t.id);
      if (list.some((o) => o.separate)) expect(list).toHaveLength(1);
    }
  });

  it("сборные грузы: от 0,1 до 6 т, от 0,5 до 30 м³, города направлений", () => {
    for (const o of w.orders) {
      expect(o.weightKg).toBeGreaterThanOrEqual(100);
      expect(o.weightKg).toBeLessThanOrEqual(6000);
      expect(o.volumeM3).toBeGreaterThanOrEqual(0.5);
      expect(o.volumeM3).toBeLessThanOrEqual(30);
      expect(["ТНП", "Стройматериалы", "Запчасти", "Продукты в коробах", "Оборудование"]).toContain(o.cargo);
    }
    const cities = new Set(w.routes.flatMap((r) => [r.fromCity, r.toCity]));
    expect([...cities].sort()).toEqual(["Брест", "Витебск", "Гомель", "Гродно", "Минск", "Могилёв", "Москва"].sort());
  });

  it("рейс в Минск собирается: есть заявки, которые влезают, и одна, которая не влезает", () => {
    const t = w.trips.find((x) => x.id === w.marks.loadingTripId)!;
    expect(t.status).toBe("PLANNED");
    const inTrip = tripOrders(w, t.id);
    const trip = { id: t.id, routeId: t.routeId as string, status: "PLANNED", vehicle: V[t.vehicleId as string], orders: inTrip };
    const free = (w.orders as unknown as AddOrder[]).filter((o) => o.routeId === t.routeId && !o.tripId && o.status === "ACCEPTED");
    const fits = free.filter((o) => !addReason(o, trip));
    expect(fits.length).toBeGreaterThanOrEqual(1);
    expect(free.some((o) => addReason(o, trip)?.startsWith("не влезет"))).toBe(true);
    // всё свободное разом не влезло бы: рейс не позволит
    expect(overloaded(loadOf([...inTrip, ...free]), trip.vehicle)).toBe(true);
  });

  it("рейс в пути прибывает сегодня, рейс на складе ждёт выдачи, у будущего рейса есть дата", () => {
    const arriving = w.trips.find((t) => t.id === w.marks.arrivingTripId)!;
    expect(arriving.status).toBe("IN_TRANSIT");
    expect(tripOrders(w, arriving.id).length).toBeGreaterThanOrEqual(5);
    const arrived = w.trips.find((t) => t.id === w.marks.arrivedTripId)!;
    expect(tripOrders(w, arrived.id).some((o) => o.status === "WITH_COURIER")).toBe(true);
    expect(w.trips.find((t) => t.id === w.marks.checklistTripId)!.departDate).not.toBeNull();
  });

  it("ни один рейс и ни одна заявка не остаются без даты", () => {
    for (const t of w.trips) {
      expect(t.departDate, t.id).not.toBeNull();
      expect(t.arriveDate, t.id).not.toBeNull();
    }
    for (const o of w.orders) {
      expect(o.loadFrom, o.id).not.toBeNull();
      expect(o.unloadFrom, o.id).not.toBeNull();
    }
  });

  it("ничего не происходит в будущем", () => {
    for (const a of w.audit) expect((a.at as Date).getTime()).toBeLessThanOrEqual(now.getTime());
    const created = Object.fromEntries(w.orders.map((o) => [o.id, (o.createdAt as Date).getTime()]));
  });

  it("документы с состояниями: у каждого рейса складской список и CMR, у заявок договоры-заявки", () => {
    for (const t of w.trips) {
      const kinds = w.documents.filter((d) => d.tripId === t.id && !d.orderId).map((d) => d.kind);
      expect(kinds.sort()).toEqual(["CMR", "WAREHOUSE"]);
    }
    const statuses = new Set(w.documents.map((d) => d.status));
    expect([...statuses].sort()).toEqual(["DRAFT", "SENT", "SIGNED"]);
    expect(w.documents.filter((d) => d.kind === "CMR").every((d) => /^\d+-2$/.test(d.number))).toBe(true);
  });

  it("палетоместа заявки считаются по палетам или по габаритам мест", () => {
    for (const o of w.orders as unknown as { pallets: number; places: number; dims: string | null; volumeM3: number }[]) {
      if (o.pallets) expect(o.dims).toBeNull();
      else expect(o.dims).toMatch(/^[\d,]+х[\d,]+х[\d,]+$/);
      expect(palletPlaces(o)).toBeGreaterThanOrEqual(1);
    }
  });

});

describe("мир живой в любой день года", () => {
  it("120 дней подряд в разное время суток: рейсы не перегружены, есть место под догруз", () => {
    for (let i = 0; i < 120; i++) {
      const now = bizMoment(addDays("2026-10-10", i * 3), (i * 7) % 24, (i * 13) % 60);
      const w = generateWorld(now);
      for (const c of tripLoadCheck(w)) expect(c.over, `день ${i} ${c.tripId}`).toBe(false);
      const t = w.trips.find((x) => x.id === w.marks.loadingTripId)!;
      const V = vehicles(w);
      const trip = { id: t.id, routeId: t.routeId as string, status: "PLANNED", vehicle: V[t.vehicleId as string], orders: tripOrders(w, t.id) };
      const free = (w.orders as unknown as AddOrder[]).filter((o) => o.routeId === t.routeId && !o.tripId && o.status === "ACCEPTED");
      expect(free.filter((o) => !addReason(o, trip)).length, `день ${i}`).toBeGreaterThanOrEqual(1);
      for (const a of w.audit) expect((a.at as Date).getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });
});

describe("пересборка мира", () => {
  const state = (builtFor: string, dirty = false, lastChangeAt: Date | null = null) => ({ builtFor, dirty, lastChangeAt });
  it("нет мира: собрать", () => expect(rebuildReason(null)).toBe("missing"));
  it("каждый день в 6:00 по Москве", () => {
    expect(rebuildReason(state("2026-10-08"), bizMoment("2026-10-09", 5, 50))).toBeNull();
    expect(rebuildReason(state("2026-10-08"), bizMoment("2026-10-09", 6, 0))).toBe("daily");
    expect(rebuildReason(state("2026-10-09"), bizMoment("2026-10-09", 23, 0))).toBeNull();
  });
  it("тихо после 20 минут без изменений", () => {
    const now = bizMoment("2026-10-09", 12, 0);
    expect(rebuildReason(state("2026-10-09", true, new Date(now.getTime() - 19 * 60_000)), now)).toBeNull();
    expect(rebuildReason(state("2026-10-09", true, new Date(now.getTime() - 21 * 60_000)), now)).toBe("idle");
  });
  const built = (builtAt: Date, dirty = false, lastChangeAt: Date | null = null) => ({ builtAt, builtFor: "2026-10-09", dirty, lastChangeAt });
  it("не реже чем раз в 6 часов, посетитель отодвигает на 5 минут, но не дольше 30", () => {
    const b = bizMoment("2026-10-09", 7, 0);
    expect(rebuildReason(built(b), new Date(b.getTime() + CEILING_MS))).toBe("ceiling");
    const now = new Date(b.getTime() + CEILING_MS + 2 * 60_000);
    expect(rebuildReason(built(b), now, now.getTime() - 60_000)).toBeNull();
    expect(rebuildReason(built(b), now, now.getTime() - QUIET_MS - 1000)).toBe("ceiling");
    const late = new Date(b.getTime() + CEILING_MS + MAX_WAIT_MS);
    expect(rebuildReason(built(b), late, late.getTime() - 1000)).toBe("ceiling");
  });
});

import type { Body, DocKind, DocStatus, OrderStatus, Prisma, TripStatus } from "@prisma/client";
import { orderLabel } from "../numbering";
import { ORDER_STATUS_LABEL } from "../status";
import { addDays, bizMoment, today, toDbDate, type DateStr } from "../time";
import { bodyFits, fitReason, fmtDims, loadOf, overloaded, palletPlaces, type BodyCode, type Cap } from "../freight";
import {
  CANCEL_REASONS,
  CARGO,
  CLIENTS,
  COMMENTS,
  COMPANY,
  LOAD_TIMES,
  PERSONS,
  RECIPIENTS,
  ROUTES,
  USERS,
  VEHICLES,
  placesOf,
  type ClientDef,
  type Place,
  type RouteDef,
} from "./reference";

// Публичная выдержка: расчёт ставки, оплаты и касса из генератора убраны, на их местах пометки.
//
// Мир демо строится от текущей даты. Один и тот же день даёт один и тот же мир:
// генератор случайных чисел засеян датой, id детерминированы.

export const ORDER_SEQ_START = 611;
const TRIP_NO_START = 151;
/** Склад и курьеры: Москва и область */
export const BASE_CITY = "Москва";

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ev =
  | { kind: "created"; at: Date; by: string }
  | { kind: "status"; at: Date; by: string; from: OrderStatus; to: OrderStatus; note?: string }
  | { kind: "trip"; at: Date; by: string; tripKey: string }
  | { kind: "cancel"; at: Date; by: string; reason: string };

type GenOrder = Prisma.OrderCreateManyInput & { _ev: Ev[]; _tripKey?: string; _loadDay: DateStr };
type GenTrip = Prisma.TripCreateManyInput & { _key: string; _ev: { at: Date; by: string; action: string; old?: string; next?: string }[]; _orders: GenOrder[] };

export type WorldData = {
  builtFor: DateStr;
  entities: Prisma.EntityCreateManyInput[];
  persons: Prisma.PersonCreateManyInput[];
  vehicles: Prisma.VehicleCreateManyInput[];
  users: Omit<Prisma.UserCreateManyInput, "passwordHash">[];
  routes: Prisma.RouteCreateManyInput[];
  clients: Prisma.ClientCreateManyInput[];
  trips: Prisma.TripCreateManyInput[];
  orders: Prisma.OrderCreateManyInput[];
  documents: Prisma.DocumentCreateManyInput[];
  audit: Prisma.AuditLogCreateManyInput[];
  counters: Prisma.CounterCreateManyInput[];
  /** Ключевые объекты мира, на которые ссылаются подсказки и тур */
  marks: { loadingTripId: string; arrivingTripId: string; checklistTripId: string; arrivedTripId: string };
};

const USER_NAME: Record<string, string> = {
  "u-owner": "Виктор Северинов",
  "u-manager": "Ольга Ракитина",
  "u-accountant": "Нина Лозовская",
  "u-courier": "Денис Капустин",
};

export function digitsOf(phones: string[]): string {
  return phones.map((p) => p.replace(/\D/g, "")).join(" ");
}

/** Дней в пути: до 750 км сутки */
export function travelDays(km: number): number {
  return Math.max(1, Math.ceil(km / 750));
}

export function generateWorld(now: Date = new Date()): WorldData {
  const D = today(now);
  const nowMs = now.getTime();
  const rnd = mulberry32(hashStr("fura5:" + D));
  const ri = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));
  const rf = (a: number, b: number) => a + rnd() * (b - a);
  const chance = (p: number) => rnd() < p;
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  /** Момент дня, но никогда не в будущем */
  const at = (d: DateStr, h: number, m = 0): Date => {
    const t = bizMoment(d, h, m);
    if (t.getTime() <= nowMs - 60_000) return t;
    return new Date(nowMs - ri(2, 25) * 60_000);
  };

  const routeById = Object.fromEntries(ROUTES.map((r) => [r.id, r]));
  const vehicleById = Object.fromEntries(VEHICLES.map((v) => [v.id, v]));
  const capOf = (vehicleId: string): Cap => vehicleById[vehicleId];
  const clientById = Object.fromEntries(CLIENTS.map((c) => [c.id, c]));
  const clientsRu = CLIENTS.filter((c) => c.side === "RU");
  const clientsBy = CLIENTS.filter((c) => c.side === "BY");

  const usedAddr = new Set<string>();
  const address = (p: Place): string => {
    for (let i = 0; i < 50; i++) {
      const a = `г. ${p.city}, ${pick(p.streets)}, ${ri(1, 120)}`;
      if (!usedAddr.has(a)) {
        usedAddr.add(a);
        return a;
      }
    }
    return `г. ${p.city}, ${pick(p.streets)}, ${ri(121, 400)}`;
  };
  /** Главный город направления чаще, города рядом реже */
  const pickPlace = (list: Place[]): Place => (chance(list[0].city === "Москва" ? 0.45 : 0.6) ? list[0] : pick(list.slice(1)));
  let recN = 0;
  const recipientPhone = () => {
    recN++;
    return `+7 900 000-${String(60 + Math.floor(recN / 100)).padStart(2, "0")}-${String(recN % 100).padStart(2, "0")}`;
  };

  const orders: GenOrder[] = [];
  const trips: GenTrip[] = [];
  let orderIdx = 0;

  type MakeOpts = {
    routeId: string;
    created: Date;
    loadDay: DateStr;
    /** что ещё влезает: заявка не больше этого */
    room?: { kg: number; m3: number; pal: number };
    /** кузов машины рейса: груз должен ему подходить */
    vehicleBody?: BodyCode;
    cargo?: string;
    body?: Body;
    minKg?: number;
    minPal?: number;
    separate?: boolean;
  };

  const makeOrder = (o: MakeOpts): GenOrder | null => {
    const route = routeById[o.routeId];
    const fromRu = route.fromCountry === "RU";
    const client = fromRu ? (chance(0.9) ? pick(clientsRu) : pick(clientsBy)) : chance(0.85) ? pick(clientsBy) : pick(clientsRu);
    let chosen: Omit<Prisma.OrderCreateManyInput, "id" | "seq" | "clientId" | "routeId" | "loadCity" | "loadRegion" | "loadFrom" | "unloadCity" | "unloadRegion" | "distanceKm" | "price" | "payForm" | "status" | "createdAt"> | null = null;
    for (let attempt = 0; attempt < 30 && !chosen; attempt++) {
      const cargo = o.cargo ? CARGO.find((c) => c.name === o.cargo)! : pick(CARGO);
      const bodies = cargo.bodies.filter((b) => (o.body ? b === o.body : true) && (!o.vehicleBody || bodyFits({ body: b, loading: "задн." }, { body: o.vehicleBody })));
      if (!bodies.length) continue;
      const body = pick(bodies);
      const topSide = cargo.topSide && (!o.vehicleBody || o.vehicleBody === "TENT") && (body === "TENT" || body === "CLOSED") && chance(cargo.topSide);
      const loading = topSide ? "верх. бок." : chance(0.08) && (!o.vehicleBody || o.vehicleBody === "TENT") && body !== "REF" ? "бок. задн." : "задн.";
      let weightKg = 0;
      let volumeM3 = 0;
      let pallets = 0;
      let places = 0;
      let dims: string | null = null;
      if (cargo.pallet) {
        const n = ri(cargo.pallet.n[0], cargo.pallet.n[1]);
        pallets = n;
        places = n;
        weightKg = Math.round(n * rf(cargo.pallet.kg[0], cargo.pallet.kg[1]) / 10) * 10;
        volumeM3 = Math.round(n * rf(cargo.pallet.m3[0], cargo.pallet.m3[1]) * 10) / 10;
      } else if (cargo.item) {
        const n = ri(cargo.item.n[0], cargo.item.n[1]);
        const d = pick(cargo.item.dims);
        places = n;
        dims = fmtDims(d);
        weightKg = Math.round(n * rf(cargo.item.kg[0], cargo.item.kg[1]) / 10) * 10;
        volumeM3 = Math.round(n * d[0] * d[1] * d[2] * 10) / 10;
      }
      // сборный груз: от 100 кг до 6 т, от 0,5 до 30 м³
      if (weightKg < 100 || weightKg > 6000 || volumeM3 < 0.5 || volumeM3 > 30) continue;
      if (o.minKg && weightKg < o.minKg) continue;
      if (o.minPal && pallets < o.minPal) continue;
      const item = { weightKg, volumeM3, pallets, places, dims };
      if (o.room && (weightKg > o.room.kg || volumeM3 > o.room.m3 || palletPlaces(item) > o.room.pal)) continue;
      chosen = { cargo: cargo.name, body, loading, separate: !!o.separate, weightKg, volumeM3, pallets, places, dims };
    }
    if (!chosen) return null;
    const pl = placesOf(route);
    const from = pickPlace(pl.from);
    const to = pickPlace(pl.to);
    // у мест в Подмосковье добавка к направлению, у городов Беларуси разница с главным городом
    const distanceKm = route.distanceKm + from.offset + to.offset;
    // ставка, форма оплаты и правка ставки: в публичную часть не входят
    const ev: Ev[] = [{ kind: "created", at: o.created, by: chance(0.8) ? "u-manager" : "u-owner" }];
    const updatedAt: Date | null = null;
    const loadTo = chance(0.4) ? addDays(o.loadDay, 1) : null;
    const loadTime = !loadTo && chance(0.45) ? pick(LOAD_TIMES) : null;
    const unloadDay = addDays(o.loadDay, travelDays(distanceKm) + ri(0, 1));
    const unloadTo = chance(0.25) ? addDays(unloadDay, 1) : null;
    const unloadTime = !unloadTo && chance(0.3) ? pick(LOAD_TIMES) : null;
    // в Москве часть груза везём до двери курьером, остальное забирают со склада
    const delivery = to.country === "RU" && chance(0.5);
    orderIdx++;
    const rec: GenOrder = {
      id: `o-${String(orderIdx).padStart(4, "0")}`,
      seq: 0,
      clientId: client.id,
      routeId: route.id,
      ...chosen,
      declaredValue: chance(0.45) ? ri(20, 300) * 100000 : null,
      loadCity: from.city,
      loadRegion: from.region,
      loadAddress: client.side === route.fromCountry && client.kind === "COMPANY" && client.address.includes(from.city) ? client.address : address(from),
      loadFrom: toDbDate(o.loadDay),
      loadTo: loadTo ? toDbDate(loadTo) : null,
      loadTime,
      unloadCity: to.city,
      unloadRegion: to.region,
      unloadAddress: address(to),
      unloadFrom: toDbDate(unloadDay),
      unloadTo: unloadTo ? toDbDate(unloadTo) : null,
      unloadTime,
      distanceKm,
      delivery,
      recipientName: delivery || chance(0.6) ? pick(RECIPIENTS) : null,
      recipientPhone: null,
      cod: null,
      // price, payForm, bargain, prepay: в публичную часть не входят
      comment: chance(0.15) ? pick(COMMENTS.filter((c) => (chosen!.loading === "задн." ? !c.includes("Растентовка") : true))) : null,
      status: "ACCEPTED",
      createdAt: o.created,
      updatedAt,
      createdById: (ev[0] as { by: string }).by,
      _ev: ev,
      _loadDay: o.loadDay,
    };
    if (rec.recipientName) rec.recipientPhone = recipientPhone();
    orders.push(rec);
    return rec;
  };

  const tripSpec = (t: { key: string; routeId: string; vehicleId: string; driverId: string; depart: DateStr | null; arrive: DateStr | null; status: TripStatus; createdDay: DateStr }): GenTrip => {
    const trip: GenTrip = {
      id: `trip-${t.key}`,
      _key: t.key,
      number: 0,
      routeId: t.routeId,
      driverId: t.driverId,
      vehicleId: t.vehicleId,
      departDate: t.depart ? toDbDate(t.depart) : null,
      arriveDate: t.arrive ? toDbDate(t.arrive) : null,
      departedAt: null,
      arrivedAt: null,
      status: t.status,
      createdAt: at(t.createdDay, 9, ri(0, 50)),
      _ev: [],
      _orders: [],
    };
    trip._ev.push({ at: trip.createdAt as Date, by: "u-owner", action: "Рейс создан" });
    trips.push(trip);
    return trip;
  };

  /** Наполнить рейс заявками до доли вместимости, никогда не больше вместимости */
  const fillTrip = (trip: GenTrip, o: { share: number; count?: number; createdFrom: DateStr; createdTo: DateStr; loadFrom: DateStr; loadTo: DateStr }) => {
    const v = vehicleById[trip.vehicleId as string];
    const cap = capOf(v.id);
    const span = Math.max(0, Math.round((Date.parse(o.createdTo) - Date.parse(o.createdFrom)) / 86400000));
    const lspan = Math.max(0, Math.round((Date.parse(o.loadTo) - Date.parse(o.loadFrom)) / 86400000));
    for (let guard = 0; guard < 200; guard++) {
      const load = loadOf(trip._orders as never);
      if (o.count != null ? trip._orders.length >= o.count : load.kg >= cap.capacityKg * o.share || load.m3 >= cap.volumeM3 * o.share || load.pal >= cap.pallets * o.share) break;
      const room = { kg: cap.capacityKg - load.kg, m3: cap.volumeM3 - load.m3, pal: cap.pallets - load.pal };
      if (room.pal < 1 || room.kg < 100 || room.m3 < 0.5) break;
      const created = at(addDays(o.createdFrom, ri(0, span)), ri(8, 18), ri(0, 59));
      const ord = makeOrder({ routeId: trip.routeId as string, created, loadDay: addDays(o.loadFrom, ri(0, lspan)), room, vehicleBody: v.body });
      if (!ord) continue;
      ord.tripId = trip.id;
      ord._tripKey = trip._key;
      ord.loadIndex = trip._orders.length + 1;
      ord._ev.push({ kind: "trip", at: new Date(Math.min((created as Date).getTime() + ri(10, 200) * 60_000, nowMs - 60_000)), by: "u-manager", tripKey: trip._key });
      trip._orders.push(ord);
    }
    return trip._orders;
  };

  const depart = (trip: GenTrip, d: DateStr) => {
    const t = at(d, ri(6, 9), ri(0, 59));
    trip.departedAt = t;
    trip._ev.push({ at: t, by: "u-manager", action: "Статус рейса", old: "Собирается", next: "В пути" });
    for (const o of trip._orders) {
      o.status = "IN_TRANSIT";
      o._ev.push({ kind: "status", at: t, by: "u-manager", from: "ACCEPTED", to: "IN_TRANSIT", note: "рейс уехал" });
    }
  };
  const arrive = (trip: GenTrip, d: DateStr, h = 17) => {
    const t = at(d, h, ri(0, 59));
    trip.arrivedAt = t;
    trip._ev.push({ at: t, by: "u-manager", action: "Статус рейса", old: "В пути", next: "На складе" });
    for (const o of trip._orders) {
      o.status = "AT_WAREHOUSE";
      o._ev.push({ kind: "status", at: t, by: "u-manager", from: "IN_TRANSIT", to: "AT_WAREHOUSE", note: "рейс прибыл" });
    }
  };
  const toCourier = (o: GenOrder, d: DateStr, courierId: string, when: Date) => {
    o.status = "WITH_COURIER";
    o.courierId = courierId;
    o.unloadFrom = toDbDate(d);
    o.unloadTo = null;
    o.unloadTime ??= pick(["9:00-12:00", "12:00-15:00", "15:00-18:00"]);
    o._ev.push({ kind: "status", at: when, by: "u-manager", from: "AT_WAREHOUSE", to: "WITH_COURIER", note: courierId === "p-cour1" ? "Денис Капустин" : "Артём Сидорчук" });
  };
  const deliver = (o: GenOrder, when: Date, by = "u-manager") => {
    o._ev.push({ kind: "status", at: when, by, from: o.status as OrderStatus, to: "DELIVERED" });
    o.status = "DELIVERED";
    o.deliveredAt = when;
  };

  // ---------- История: закрытые рейсы за восемь недель ----------
  const ROTATION: [string, string][] = [
    ["r-mow-msq", "v1"],
    ["r-msq-mow", "v2"],
    ["r-mow-gna", "v3"],
    ["r-mow-vtb", "v4"],
    ["r-mow-gme", "v5"],
    ["r-mow-bqt", "v2"],
    ["r-msq-mow", "v1"],
    ["r-mow-mvq", "v4"],
    ["r-gme-mow", "v5"],
    ["r-mow-msq", "v3"],
    ["r-bqt-mow", "v2"],
    ["r-vtb-mow", "v4"],
  ];
  const driverOf = (vehicleId: string) => PERSONS.find((p) => p.vehicleId === vehicleId)!.id;
  let rot = Math.floor(rnd() * ROTATION.length);
  for (let off = -56; off <= -6; off += ri(2, 3)) {
    const d = addDays(D, off);
    const [routeId, vehicleId] = ROTATION[rot++ % ROTATION.length];
    const route = routeById[routeId];
    const dur = travelDays(route.distanceKm);
    const trip = tripSpec({ key: `h${off + 100}`, routeId, vehicleId, driverId: driverOf(vehicleId), depart: d, arrive: addDays(d, dur), status: "ARRIVED", createdDay: addDays(d, -5) });
    fillTrip(trip, { share: rf(0.55, 0.85), createdFrom: addDays(d, -6), createdTo: addDays(d, -1), loadFrom: addDays(d, -2), loadTo: d });
    depart(trip, d);
    arrive(trip, addDays(d, dur));
    for (const o of trip._orders) {
      const arr = addDays(d, dur);
      const dd = addDays(arr, ri(0, 2));
      const delDay = dd < D ? dd : addDays(D, -1);
      if (o.delivery) {
        toCourier(o, delDay, chance(0.6) ? "p-cour1" : "p-cour2", at(delDay, 8, ri(0, 40)));
        deliver(o, at(delDay, ri(10, 18), ri(0, 59)), "u-courier");
      } else deliver(o, at(delDay, ri(9, 18), ri(0, 59)));
      // оплаты: в публичную часть не входят
    }
  }
  // Отменённые заявки в истории
  for (let i = 0; i < 6; i++) {
    const d = addDays(D, -ri(8, 50));
    const o = makeOrder({ routeId: pick(ROUTES).id, created: at(d, ri(9, 17), ri(0, 59)), loadDay: addDays(d, 2) });
    if (!o) continue;
    o.status = "CANCELLED";
    const reason = pick(CANCEL_REASONS);
    o.cancelReason = reason;
    o._ev.push({ kind: "cancel", at: at(addDays(d, 1), 11, ri(0, 59)), by: "u-manager", reason });
  }

  // ---------- Текущие рейсы ----------
  // 1. Прибыл вчера из Витебска на склад: часть у курьеров на сегодня
  const arrived = tripSpec({ key: "now-arrived", routeId: "r-vtb-mow", vehicleId: "v5", driverId: "p-drv5", depart: addDays(D, -2), arrive: addDays(D, -1), status: "ARRIVED", createdDay: addDays(D, -7) });
  fillTrip(arrived, { share: 0.8, createdFrom: addDays(D, -7), createdTo: addDays(D, -3), loadFrom: addDays(D, -3), loadTo: addDays(D, -2) });
  depart(arrived, addDays(D, -2));
  arrive(arrived, addDays(D, -1), 16);
  arrived._orders.forEach((o, idx) => {
    if (idx < 5) {
      o.delivery = true;
      o.recipientName ??= pick(RECIPIENTS);
      o.recipientPhone ??= recipientPhone();
      toCourier(o, D, idx < 3 ? "p-cour1" : "p-cour2", at(D, 8, ri(5, 40)));
      if (idx === 0) deliver(o, at(D, 10, ri(5, 50)), "u-courier");
    } else if (idx === 5) deliver(o, at(addDays(D, -1), 18, ri(10, 50)));
  });

  // 2. В пути из Минска, прибывает сегодня: для «Рейс прибыл»
  const arriving = tripSpec({ key: "now-arriving", routeId: "r-msq-mow", vehicleId: "v2", driverId: "p-drv2", depart: addDays(D, -1), arrive: D, status: "IN_TRANSIT", createdDay: addDays(D, -6) });
  fillTrip(arriving, { share: 0.8, createdFrom: addDays(D, -6), createdTo: addDays(D, -2), loadFrom: addDays(D, -2), loadTo: addDays(D, -1) });
  depart(arriving, addDays(D, -1));

  // 3. В пути в Брест, малая машина
  const transit = tripSpec({ key: "now-transit", routeId: "r-mow-bqt", vehicleId: "v4", driverId: "p-drv4", depart: addDays(D, -1), arrive: addDays(D, 1), status: "IN_TRANSIT", createdDay: addDays(D, -5) });
  fillTrip(transit, { share: 0.75, createdFrom: addDays(D, -5), createdTo: addDays(D, -2), loadFrom: addDays(D, -2), loadTo: addDays(D, -1) });
  depart(transit, addDays(D, -1));

  // 4. Собирается в Минск, выезд завтра: место для догруза ещё есть
  const loading = tripSpec({ key: "now-loading", routeId: "r-mow-msq", vehicleId: "v1", driverId: "p-drv1", depart: addDays(D, 1), arrive: addDays(D, 2), status: "PLANNED", createdDay: addDays(D, -4) });
  fillTrip(loading, { share: 0.8, createdFrom: addDays(D, -4), createdTo: D, loadFrom: addDays(D, -1), loadTo: addDays(D, 1) });
  // под догруз остаётся хотя бы 3 палетоместа: лишние последние заявки ждут без рейса
  while (loading._orders.length > 4 && vehicleById["v1"].pallets - loadOf(loading._orders as never).pal < 3) {
    const o = loading._orders.pop()!;
    o.tripId = null;
    o._tripKey = undefined;
    o.loadIndex = null;
    o._ev = o._ev.filter((e) => e.kind !== "trip");
  }

  // 5. Рейс в Гродно через четыре дня: собирается, у витрины дата выезда есть всегда
  const future = tripSpec({ key: "now-future", routeId: "r-mow-gna", vehicleId: "v3", driverId: "p-drv3", depart: addDays(D, 4), arrive: addDays(D, 5), status: "PLANNED", createdDay: addDays(D, -2) });
  fillTrip(future, { share: 0.35, count: 4, createdFrom: addDays(D, -3), createdTo: D, loadFrom: addDays(D, 2), loadTo: addDays(D, 4) });

  // ---------- Свободные заявки без рейса ----------
  const freeOrder = (routeId: string, opts: Partial<MakeOpts> = {}) => {
    const d = addDays(D, -ri(0, 3));
    const o = makeOrder({ routeId, created: at(d, ri(9, 18), ri(0, 59)), loadDay: addDays(D, ri(0, 3)), ...opts });
    return o;
  };
  // Москва → Минск: три-четыре влезают в собирающийся рейс, одна не влезает, одна просит реф и одна отдельную машину
  {
    const v = vehicleById["v1"];
    const load = loadOf(loading._orders as never);
    const room = { kg: v.capacityKg - load.kg, m3: v.volumeM3 - load.m3, pal: v.pallets - load.pal };
    const share = { kg: room.kg / 2, m3: room.m3 / 2, pal: Math.max(1, Math.floor(room.pal / 2)) };
    for (let i = 0, made = 0; i < 60 && made < 4; i++) if (freeOrder("r-mow-msq", { room: share, vehicleBody: "TENT", loadDay: addDays(D, ri(0, 1)) })) made++;
    // не влезает по палетам: больше, чем осталось мест на полу
    for (let i = 0; i < 80; i++) if (freeOrder("r-mow-msq", { cargo: "ТНП", minPal: room.pal + 1, vehicleBody: "TENT" })) break;
    for (let i = 0; i < 20; i++) if (freeOrder("r-mow-msq", { body: "REF", cargo: "Продукты в коробах" })) break;
    for (let i = 0; i < 20; i++) if (freeOrder("r-mow-msq", { cargo: "Оборудование", separate: true, minKg: 2500 })) break;
  }
  const FREE: [string, number][] = [
    ["r-mow-bqt", 2], ["r-mow-gme", 2], ["r-mow-vtb", 2], ["r-mow-mvq", 2], ["r-mow-gna", 2],
    ["r-msq-mow", 3], ["r-bqt-mow", 1], ["r-gme-mow", 1], ["r-mvq-mow", 1], ["r-gna-mow", 1],
  ];
  for (const [routeId, n] of FREE) for (let i = 0, made = 0; i < 20 && made < n; i++) if (freeOrder(routeId)) made++;

  // ---------- Проверка: ни один рейс не перегружен, кузов подходит ----------
  for (const t of trips) {
    const v = vehicleById[t.vehicleId as string];
    if (overloaded(loadOf(t._orders as never), v)) throw new Error(`Перегруз в рейсе ${t._key}`);
    for (const o of t._orders) if (!bodyFits({ body: o.body as BodyCode, loading: o.loading }, v)) throw new Error(`Кузов не подходит: ${t._key}`);
  }
  void fitReason;

  // ---------- Нумерация ----------
  orders.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime() || a.id.localeCompare(b.id));
  orders.forEach((o, i) => (o.seq = ORDER_SEQ_START + i));
  const tripsSorted = [...trips].sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
  let tripNo = TRIP_NO_START;
  for (const t of tripsSorted) t.number = tripNo++;
  const tripByKey = Object.fromEntries(trips.map((t) => [t._key, t]));

  // ---------- Журнал ----------
  const audit: Prisma.AuditLogCreateManyInput[] = [];
  let auditN = 0;
  const log = (a: Omit<Prisma.AuditLogCreateManyInput, "id">) => {
    auditN++;
    audit.push({ id: `a-${String(auditN).padStart(5, "0")}`, ...a });
  };
  const tripLabel = (t: GenTrip) => `Рейс № ${t.number}`;

  for (const o of orders) {
    const label = `Заявка № ${orderLabel(o.seq)}`;
    const route = routeById[o.routeId];
    let prevAt = 0;
    for (const e of o._ev) {
      if (e.kind !== "status" && e.kind !== "created" && e.kind !== "trip") continue;
      if (e.at.getTime() <= prevAt) {
        e.at = new Date(Math.min(prevAt + ri(1, 4) * 60_000, Math.max(prevAt + 1000, nowMs - 10_000)));
        if (e.kind === "status" && e.to === "DELIVERED") o.deliveredAt = e.at;
      }
      prevAt = e.at.getTime();
    }
    for (const e of o._ev) {
      const base = { at: e.at, userId: e.by.startsWith("u-") ? e.by : null, userName: USER_NAME[e.by] ?? "", objectType: "order", objectId: o.id, objectLabel: label };
      if (e.kind === "created") {
        log({ ...base, action: "Заявка создана", newValue: `${o.cargo}, ${o.loadCity} → ${o.unloadCity}, ${o.distanceKm} км` });
      } else if (e.kind === "trip") {
        const t = tripByKey[e.tripKey];
        log({ ...base, action: "Поставлена в рейс", newValue: tripLabel(t) });
      } else if (e.kind === "status") {
        const t = o._tripKey ? tripByKey[o._tripKey] : null;
        const note = e.note === "рейс уехал" && t ? `${tripLabel(t)} уехал` : e.note === "рейс прибыл" && t ? `${tripLabel(t)} прибыл` : e.note ? `Курьер: ${e.note}` : null;
        log({ ...base, action: "Статус", field: "Статус", oldValue: ORDER_STATUS_LABEL[e.from], newValue: ORDER_STATUS_LABEL[e.to], note });
      } else if (e.kind === "cancel") {
        log({ ...base, action: "Заявка отменена", field: "Статус", oldValue: "Принята", newValue: "Отменена", note: e.reason });
      }
    }
  }
  for (const t of trips) {
    const route = routeById[t.routeId as string];
    for (const e of t._ev) {
      log({ at: e.at, userId: e.by, userName: USER_NAME[e.by] ?? "", objectType: "trip", objectId: t.id, objectLabel: tripLabel(t), action: e.action, field: e.old ? "Статус" : null, oldValue: e.old ?? null, newValue: e.next ?? `${route.fromCity} → ${route.toCity}` });
    }
  }

  // Касса: в публичную часть не входит.

  // ---------- Документы ----------
  const documents: Prisma.DocumentCreateManyInput[] = [];
  let docN = 0;
  const doc = (d: { kind: DocKind; number: string; date: DateStr; tripId?: string | null; orderId?: string | null; clientId?: string | null; status: DocStatus; sentTo?: string | null; sentAt?: Date | null; signedAt?: Date | null; createdAt: Date }) => {
    docN++;
    documents.push({ id: `d-${String(docN).padStart(4, "0")}`, ...d, date: toDbDate(d.date) });
  };
  const contactOf = (clientId: string) => {
    const c: ClientDef = clientById[clientId];
    return c.email ?? c.phones[0];
  };
  const dayOf = (x: Date | string | null | undefined): DateStr => (x instanceof Date ? today(x) : (x as string));
  for (const t of trips) {
    const departed = t.status !== "PLANNED";
    const tday = t.departDate ? dayOf(t.departDate as Date) : today(t.createdAt as Date);
    const made = t.createdAt as Date;
    doc({ kind: "WAREHOUSE", number: `${t.number}-1`, date: tday, tripId: t.id, status: departed ? "SIGNED" : "DRAFT", signedAt: departed ? (t.departedAt as Date) : null, createdAt: made });
    doc({ kind: "CMR", number: `${t.number}-2`, date: tday, tripId: t.id, status: departed ? "SIGNED" : "DRAFT", sentTo: departed ? PERSONS.find((p) => p.id === t.driverId)!.name : null, sentAt: departed ? (t.departedAt as Date) : null, signedAt: departed ? (t.departedAt as Date) : null, createdAt: made });
  }
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    const created = o.createdAt as Date;
    const inTrip = !!o.tripId;
    const t = o._tripKey ? tripByKey[o._tripKey] : null;
    const st: DocStatus = t && t.status !== "PLANNED" ? "SIGNED" : inTrip ? (chance(0.6) ? "SENT" : chance(0.5) ? "SIGNED" : "DRAFT") : chance(0.5) ? "SENT" : "DRAFT";
    const sentAt = st !== "DRAFT" ? new Date(Math.min(created.getTime() + ri(20, 180) * 60_000, nowMs - 60_000)) : null;
    doc({ kind: "CONTRACT", number: orderLabel(o.seq), date: today(created), orderId: o.id, tripId: o.tripId ?? null, clientId: o.clientId, status: st, sentTo: st !== "DRAFT" ? contactOf(o.clientId) : null, sentAt, signedAt: st === "SIGNED" ? new Date(Math.min((sentAt as Date).getTime() + ri(30, 600) * 60_000, nowMs - 60_000)) : null, createdAt: created });
    if (o.status === "DELIVERED" && o.deliveredAt) {
      const dd = o.deliveredAt as Date;
      const signed = chance(0.75);
      const s1 = new Date(Math.min(dd.getTime() + ri(30, 300) * 60_000, nowMs - 60_000));
      doc({ kind: "ACT", number: orderLabel(o.seq), date: today(dd), orderId: o.id, tripId: o.tripId ?? null, clientId: o.clientId, status: signed ? "SIGNED" : "SENT", sentTo: contactOf(o.clientId), sentAt: s1, signedAt: signed ? new Date(Math.min(s1.getTime() + ri(60, 2000) * 60_000, nowMs - 60_000)) : null, createdAt: dd });
      doc({ kind: "INVOICE", number: orderLabel(o.seq), date: today(dd), orderId: o.id, tripId: o.tripId ?? null, clientId: o.clientId, status: "SENT", sentTo: contactOf(o.clientId), sentAt: s1, createdAt: dd });
    }
  }

  // Клиенты: один без заявок скрыт с причиной
  const clients: Prisma.ClientCreateManyInput[] = CLIENTS.map((c, i) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    residency: c.residency,
    taxId: c.taxId,
    kpp: c.kpp,
    bankName: c.bankName,
    account: c.account,
    director: c.director,
    contactPerson: c.contactPerson,
    address: c.address,
    phones: c.phones,
    phoneDigits: digitsOf(c.phones),
    email: c.email,
    hidden: false,
    createdAt: at(addDays(D, -200 + i * 3), 12),
  }));
  {
    const used = new Set(orders.map((o) => o.clientId));
    const unused = clients.find((c) => !used.has(c.id));
    if (unused) {
      unused.hidden = true;
      unused.hiddenReason = "Больше не работаем";
    }
  }

  const strip = <T extends object>(x: T) => {
    const out = { ...x } as Record<string, unknown>;
    for (const k of Object.keys(out)) if (k.startsWith("_")) delete out[k];
    return out;
  };

  return {
    builtFor: D,
    entities: [{ ...COMPANY, tripSeq: tripNo - 1 }],
    persons: PERSONS.map((p) => ({ ...p })),
    vehicles: VEHICLES.map((v) => ({ ...v })),
    users: USERS.map((u) => ({ ...u })),
    routes: ROUTES.map((r: RouteDef) => ({ ...r })),
    clients,
    trips: trips.map((t) => strip(t) as Prisma.TripCreateManyInput),
    orders: orders.map((o) => strip(o) as Prisma.OrderCreateManyInput),
    documents,
    audit,
    counters: [
      { key: "orderSeq", value: ORDER_SEQ_START + orders.length - 1 },
      { key: "doc", value: docN },
    ],
    marks: { loadingTripId: loading.id, arrivingTripId: arriving.id, checklistTripId: future.id, arrivedTripId: arrived.id },
  };
}

/** Для тестов: занятость рейса мира */
export function tripLoadCheck(w: WorldData) {
  const vehicles = Object.fromEntries(w.vehicles.map((v) => [v.id, v]));
  return w.trips.map((t) => {
    const list = w.orders.filter((o) => o.tripId === t.id) as unknown as { weightKg: number; volumeM3: number; pallets: number; places: number; dims: string | null }[];
    const v = vehicles[t.vehicleId as string] as unknown as Cap;
    return { tripId: t.id, load: loadOf(list), cap: v, over: overloaded(loadOf(list), v) };
  });
}


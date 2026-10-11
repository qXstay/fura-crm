"use client";

// Действия интерфейса: сразу меняют данные вкладки, на сервер уходят в фоне. Ошибка откатывает и пишет коротко.

import { addReason, type AddOrder, type AddTrip } from "@/lib/freight";
import type { DocKindCode, SDoc, SOrder, STrip } from "@/lib/snapshot";
import { indexOf, put, type State, type Store } from "./store";
import { toast } from "./toast";
import { count, orderLabel } from "./format";
import { markTried } from "./tried";

const nowIso = () => new Date().toISOString();

export function tripFor(s: State, tripId: string): AddTrip | null {
  const ix = indexOf(s);
  const t = ix.trip.get(tripId);
  if (!t) return null;
  const v = t.vehicleId ? ix.vehicle.get(t.vehicleId) ?? null : null;
  return { id: t.id, routeId: t.routeId, status: t.status, vehicle: v, orders: ix.tripOrders.get(t.id) ?? [] };
}

export function canAdd(s: State, order: SOrder, tripId: string): string | null {
  const t = tripFor(s, tripId);
  if (!t) return "рейс не найден";
  return addReason(order as unknown as AddOrder, t);
}

export async function putInTrip(store: Store, tripId: string, orderIds: string[]) {
  const s0 = store.get();
  const trip = indexOf(s0).trip.get(tripId);
  if (!trip) return null;
  // что встанет: проверяем по очереди, как сервер
  const ok: string[] = [];
  let cur = s0;
  for (const id of orderIds) {
    const o = indexOf(cur).order.get(id);
    if (!o) continue;
    const why = canAdd(cur, o, tripId);
    if (why) {
      if (orderIds.length === 1) toast(`Заявка № ${orderLabel(o.seq)}: ${why}.`, "error");
      continue;
    }
    const idx = (indexOf(cur).tripOrders.get(tripId) ?? []).reduce((m, x) => Math.max(m, x.loadIndex ?? 0), 0) + 1;
    cur = put.order(cur, { ...o, tripId, loadIndex: idx, updatedAt: nowIso() });
    ok.push(id);
  }
  if (!ok.length) return null;
  const res = await store.act<{ added: string[]; skipped: { id: string; no: string; why: string }[]; loadIndex: Record<string, number> }>(
    "trip.add",
    { tripId, orderIds: ok },
    {
      apply: () => cur,
      commit: (s, d) => put.orders(s, (o) => (d.loadIndex[o.id] != null && o.tripId === tripId ? { ...o, loadIndex: d.loadIndex[o.id] } : d.skipped.some((x) => x.id === o.id) ? { ...o, tripId: null, loadIndex: null } : null)),
    },
  );
  if (res) {
    if (res.added.length) markTried("toTrip");
    if (res.skipped.length) toast(`Не встали: ${res.skipped.map((x) => `${x.no} (${x.why})`).join(", ")}`, "error");
    else toast(ok.length === 1 ? `Заявка № ${orderLabel(indexOf(store.get()).order.get(ok[0])!.seq)} в рейсе № ${trip.number}` : `${count(ok.length, "заявка", "заявки", "заявок")} в рейсе № ${trip.number}`, "ok");
  }
  return res;
}

export async function removeFromTrip(store: Store, tripId: string, orderId: string) {
  return store.act("trip.remove", { tripId, orderId }, {
    apply: (s) => {
      const list = (indexOf(s).tripOrders.get(tripId) ?? []).filter((o) => o.id !== orderId);
      const order = new Map(list.map((o, i) => [o.id, i + 1]));
      return put.orders(s, (o) => (o.id === orderId ? { ...o, tripId: null, loadIndex: null, updatedAt: nowIso() } : order.has(o.id) ? { ...o, loadIndex: order.get(o.id)! } : null));
    },
  });
}

export async function updateTrip(store: Store, tripId: string, patch: { driverId?: string | null; departDate?: string | null }) {
  return store.act<{ trip: STrip }>("trip.update", { tripId, ...patch }, {
    apply: (s) => {
      const ix = indexOf(s);
      const t = ix.trip.get(tripId)!;
      const driver = patch.driverId ? ix.person.get(patch.driverId) : null;
      return put.trip(s, { ...t, ...(patch.departDate !== undefined ? { departDate: patch.departDate } : {}), ...(patch.driverId !== undefined ? { driverId: patch.driverId, vehicleId: driver?.vehicleId ?? null } : {}) });
    },
    commit: (s, d) => put.trip(s, d.trip),
  });
}

export async function createTrip(store: Store, input: { id?: string; routeId: string; driverId: string | null; departDate: string | null }) {
  const id = input.id ?? crypto.randomUUID();
  const s0 = store.get();
  const number = Math.max(0, ...s0.trips.map((t) => t.number)) + 1;
  const driver = input.driverId ? indexOf(s0).person.get(input.driverId) : null;
  const res = await store.act<{ trip: STrip }>("trip.create", { ...input, id }, {
    apply: (s) => put.trip(s, { id, number, routeId: input.routeId, driverId: input.driverId, vehicleId: driver?.vehicleId ?? null, departDate: input.departDate, arriveDate: null, departedAt: null, arrivedAt: null, status: "PLANNED", createdAt: nowIso(), pending: true }),
    commit: (s, d) => put.trip(s, d.trip),
  });
  return res ? id : null;
}

// ---------- Заявки ----------

export async function createDoc(store: Store, kind: DocKindCode, target: { tripId?: string | null; orderId?: string | null }) {
  const s0 = store.get();
  const ix = indexOf(s0);
  const existing = s0.docs.find((d) => d.kind === kind && (kind === "WAREHOUSE" || kind === "CMR" ? d.tripId === target.tripId : d.orderId === target.orderId));
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  const t = target.tripId ? ix.trip.get(target.tripId) : null;
  const o = target.orderId ? ix.order.get(target.orderId) : null;
  const number = kind === "WAREHOUSE" || kind === "CMR" ? `${t?.number}-${kind === "WAREHOUSE" ? 1 : 2}` : orderLabel(o?.seq ?? 0);
  const doc: SDoc = { id, kind, number, date: s0.today, tripId: t?.id ?? o?.tripId ?? null, orderId: o?.id ?? null, clientId: o?.clientId ?? null, status: "DRAFT", sentTo: null, sentAt: null, signedAt: null, createdAt: nowIso() };
  const res = await store.act<{ doc: SDoc }>("doc.create", { id, kind, tripId: target.tripId ?? null, orderId: target.orderId ?? null }, {
    apply: (s) => put.doc(s, doc),
    commit: (s, d) => (d.doc.id !== id ? put.doc({ ...s, docs: s.docs.filter((x) => x.id !== id) }, d.doc) : put.doc(s, d.doc)),
  });
  return res ? (res.doc.id ?? id) : null;
}

export async function sendDoc(store: Store, id: string, to: string) {
  const d = indexOf(store.get()).doc.get(id)!;
  const res = await store.act<{ doc: SDoc }>("doc.send", { id, to }, { apply: (s) => put.doc(s, { ...d, status: "SENT", sentTo: to, sentAt: nowIso() }), commit: (s, r) => put.doc(s, r.doc) });
  if (res) toast(`Отправлено: ${to}`, "ok");
  return res;
}

// Остальные действия (статусы, заявки, клиенты, оплаты и касса) в публичную часть не входят.

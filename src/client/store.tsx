"use client";

import { createContext, useContext, useState, useSyncExternalStore } from "react";
import type { Snapshot, SAudit, SClient, SDoc, SOrder, SPerson, SRoute, STrip, SVehicle } from "@/lib/snapshot";
import type { Action } from "@/lib/perms";
import { STALE_TEXT } from "@/lib/world/stale";
import { toast } from "./toast";

export type State = Snapshot;

type Listener = () => void;

/** Хранилище вкладки: один снимок данных и подписчики. Создаётся на каждую вкладку, на сервере на каждый запрос. */
export class Store {
  state: State;
  private listeners = new Set<Listener>();
  private pending = 0;

  constructor(s: State) {
    this.state = s;
  }

  get = () => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  set(next: State) {
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l();
  }

  update(fn: (s: State) => State) {
    this.set(fn(this.state));
  }

  can(a: Action) {
    return this.state.me.can.includes(a);
  }

  /** Свежий снимок с сервера: после пересборки мира, «Начать заново» и неудачного изменения */
  async reload(): Promise<boolean> {
    try {
      const r = await fetch("/api/snapshot", { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/login";
        return false;
      }
      if (!r.ok) return false;
      const snap = (await r.json()) as Snapshot;
      this.set(snap);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Изменение: сначала в интерфейсе (apply), потом в фоне на сервер.
   * commit сливает ответ сервера (номера, время, журнал). При ошибке откат и короткое сообщение.
   */
  async act<T = Record<string, unknown>>(a: string, p: Record<string, unknown>, opt: { apply?: (s: State) => State; commit?: (s: State, data: T) => State; quiet?: boolean } = {}): Promise<T | null> {
    const before = this.state;
    if (opt.apply) this.set(opt.apply(this.state));
    const optimistic = this.state;
    this.pending++;
    try {
      const r = await fetch("/api/act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a, p }) });
      const res = (await r.json()) as { ok: true; data: T } | { ok: false; error: string };
      if (!res.ok) throw new Error(res.error);
      const data = res.data;
      this.update((s) => withLog(opt.commit ? opt.commit(s, data) : s, (data as { log?: SAudit[] })?.log));
      return data;
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Не получилось сохранить. Попробуйте ещё раз.";
      if (msg === STALE_TEXT) {
        await this.reload();
        toast("Данные обновились, пока вкладка была открыта. Повторите действие, если оно ещё нужно.");
        return null;
      }
      // откат: если после нас ничего не менялось, возвращаем как было, иначе берём правду с сервера
      if (this.state === optimistic) this.set(before);
      else await this.reload();
      if (!opt.quiet) toast(msg, "error");
      return null;
    } finally {
      this.pending--;
    }
  }

  busy() {
    return this.pending > 0;
  }
}

export function withLog(s: State, log: SAudit[] | undefined | null): State {
  if (!log || !log.length) return s;
  return { ...s, audit: [...s.audit, ...log] };
}

// ---------- Простые изменения снимка ----------

function upsert<T extends { id: string }>(list: T[], item: T, front = true): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return front ? [item, ...list] : [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

export const put = {
  order: (s: State, o: SOrder): State => ({ ...s, orders: upsert(s.orders, o) }),
  orders: (s: State, patch: (o: SOrder) => SOrder | null): State => ({ ...s, orders: s.orders.map((o) => patch(o) ?? o) }),
  trip: (s: State, t: STrip): State => ({ ...s, trips: upsert(s.trips, t) }),
  client: (s: State, c: SClient): State => ({ ...s, clients: upsert(s.clients, c) }),
  doc: (s: State, d: SDoc): State => ({ ...s, docs: upsert(s.docs, d) }),
};

// ---------- Индексы: считаются один раз на версию снимка ----------

export type Index = {
  order: Map<string, SOrder>;
  trip: Map<string, STrip>;
  client: Map<string, SClient>;
  route: Map<string, SRoute>;
  vehicle: Map<string, SVehicle>;
  person: Map<string, SPerson>;
  doc: Map<string, SDoc>;
  tripOrders: Map<string, SOrder[]>;
  orderDocs: Map<string, SDoc[]>;
  tripDocs: Map<string, SDoc[]>;
  clientOrders: Map<string, SOrder[]>;
  audit: Map<string, SAudit[]>;
};

const cache = new WeakMap<State, Index>();

export function indexOf(s: State): Index {
  const hit = cache.get(s);
  if (hit) return hit;
  const group = <T,>(list: T[], key: (x: T) => string | null) => {
    const m = new Map<string, T[]>();
    for (const x of list) {
      const k = key(x);
      if (!k) continue;
      const arr = m.get(k);
      if (arr) arr.push(x);
      else m.set(k, [x]);
    }
    return m;
  };
  const tripOrders = group(s.orders, (o) => o.tripId);
  for (const list of tripOrders.values()) list.sort((a, b) => (a.loadIndex ?? 999) - (b.loadIndex ?? 999));
  const ix: Index = {
    order: new Map(s.orders.map((o) => [o.id, o])),
    trip: new Map(s.trips.map((t) => [t.id, t])),
    client: new Map(s.clients.map((c) => [c.id, c])),
    route: new Map(s.routes.map((r) => [r.id, r])),
    vehicle: new Map(s.vehicles.map((v) => [v.id, v])),
    person: new Map(s.persons.map((p) => [p.id, p])),
    doc: new Map(s.docs.map((d) => [d.id, d])),
    tripOrders,
    orderDocs: group(s.docs, (d) => d.orderId),
    tripDocs: group(s.docs, (d) => d.tripId),
    clientOrders: group(s.orders, (o) => o.clientId),
    audit: group(s.audit, (a) => a.objectId),
  };
  cache.set(s, ix);
  return ix;
}

// ---------- React ----------

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ snapshot, children }: { snapshot: Snapshot; children: React.ReactNode }) {
  const [store] = useState(() => new Store(snapshot));
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStoreApi(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider не найден");
  return s;
}

/** Весь снимок: перерисовка при любом изменении */
export function useData(): State {
  const store = useStoreApi();
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export function useIndex(): Index {
  return indexOf(useData());
}

export function useCan(a: Action): boolean {
  return useData().me.can.includes(a);
}

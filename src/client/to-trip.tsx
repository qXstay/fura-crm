"use client";

import { freeOf, loadOf, tons } from "@/lib/freight";
import type { SOrder } from "@/lib/snapshot";
import { canAdd, createTrip, putInTrip } from "./actions";
import { dayLong, vehicleLine, m3 } from "./format";
import { Icon } from "./icons";
import { go } from "./router";
import { indexOf, useData, useStoreApi } from "./store";
import { Button, Popover, usePop } from "./ui";

/** «В рейс»: рейсы этого направления, которые собираются. Неподходящие видны с причиной. */
export function ToTrip({ order, size = "sm", variant = "default", label = "В рейс", testId = "order-add-trip" }: { order: SOrder; size?: "sm" | "md"; variant?: "default" | "primary"; label?: string; testId?: string }) {
  const store = useStoreApi();
  const s = useData();
  const pop = usePop();
  const ix = indexOf(s);
  const route = ix.route.get(order.routeId);
  const trips = s.trips.filter((t) => t.routeId === order.routeId && t.status === "PLANNED").sort((a, b) => (a.departDate ?? "9999").localeCompare(b.departDate ?? "9999"));
  const canLoad = s.me.can.includes("trips.load");
  if (!canLoad || order.status !== "ACCEPTED" || order.tripId || order.archived) return null;
  return (
    <>
      <Button
        ref={pop.ref}
        size={size === "sm" ? "sm" : "md"}
        variant={variant}
        onClick={(e) => {
          e.stopPropagation();
          pop.toggle();
        }}
        data-testid={testId}
      >
        {label}
      </Button>
      <Popover open={pop.open} onClose={pop.close} anchor={pop.ref} width={340} align="end">
        <div className="px-2 pb-1.5 pt-1 text-[12px] text-[var(--ink-3)]">
          Рейсы {route?.fromCity} → {route?.toCity}, собираются
        </div>
        {trips.length === 0 && <div className="px-2 py-2 text-[13px] text-[var(--ink-2)]">Сейчас нет собирающихся рейсов в этом направлении.</div>}
        {trips.map((t) => {
          const why = canAdd(s, order, t.id);
          const v = t.vehicleId ? ix.vehicle.get(t.vehicleId) : null;
          const free = v ? freeOf(loadOf(ix.tripOrders.get(t.id) ?? []), v) : null;
          const driver = t.driverId ? ix.person.get(t.driverId) : null;
          return (
            <button
              key={t.id}
              className="menu-item items-start"
              disabled={!!why}
              data-testid="to-trip-option"
              onClick={(e) => {
                e.stopPropagation();
                pop.close();
                void putInTrip(store, t.id, [order.id]);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium text-[var(--ink)]">
                  Рейс № {t.number} · {t.departDate ? `выезд ${dayLong(t.departDate)}` : "дата не указана"}
                </span>
                <span className="block text-[12px] text-[var(--ink-3)]">
                  {v ? vehicleLine(v) : "машина не выбрана"}
                  {driver ? `, ${driver.name}` : ""}
                </span>
                {free && (
                  <span className="block text-[12px] text-[var(--ink-2)]">
                    свободно {tons(Math.max(0, free.kg))} т / {m3(Math.max(0, free.m3))} м³ / {Math.max(0, free.pal)} пал.
                  </span>
                )}
                {why && <span className="block text-[12px] text-[var(--danger)]">нельзя: {why}</span>}
              </span>
              {!why && <Icon name="right" size={14} className="mt-0.5 text-[var(--ink-3)]" />}
            </button>
          );
        })}
        {s.me.can.includes("trips.create") && (
          <>
            <div className="my-1 h-px bg-[var(--line)]" />
            <button
              className="menu-item"
              data-testid="to-new-trip"
              onClick={async (e) => {
                e.stopPropagation();
                pop.close();
                const driver = s.persons.find((p) => p.kind === "DRIVER" && p.vehicleId && !s.trips.some((t) => t.driverId === p.id && t.status !== "ARRIVED"));
                const id = crypto.randomUUID();
                const made = createTrip(store, { id, routeId: order.routeId, driverId: driver?.id ?? null, departDate: null });
                go(`/trips/${id}`, { top: true });
                if (await made) await putInTrip(store, id, [order.id]);
              }}
            >
              <Icon name="plus" size={14} className="text-[var(--ink-3)]" />
              Новый рейс {route?.fromCity} → {route?.toCity}
            </button>
          </>
        )}
      </Popover>
    </>
  );
}

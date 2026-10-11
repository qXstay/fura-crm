"use client";

import { useEffect, useMemo, useState } from "react";
import type { DocInfo } from "@/lib/docs/types";
import type { STrip } from "@/lib/snapshot";
import { createDoc, sendDoc, updateTrip } from "./actions";
import { loadPack, Pages, PrintRoot, useLoaded } from "./doc-view";
import { count } from "./format";
import { Icon } from "./icons";
import { indexOf, useData, useStoreApi } from "./store";
import { toast } from "./toast";
import { markTried } from "./tried";
import { Button, cx, DateField, IconButton, Sheet } from "./ui";

/** Подпись данных пакета: меняется, когда меняется что-то, что печатается */
export function packSig(trip: STrip, s: ReturnType<typeof useData>): string {
  const ix = indexOf(s);
  const orders = ix.tripOrders.get(trip.id) ?? [];
  const v = trip.vehicleId ? ix.vehicle.get(trip.vehicleId) : null;
  return [trip.departDate, trip.driverId, trip.vehicleId, v?.plate, trip.status, s.version, ...orders.map((o) => `${o.id}:${o.loadIndex}:${o.updatedAt ?? ""}`)].join("|");
}

export function prefetchPack(trip: STrip, s: ReturnType<typeof useData>) {
  void loadPack(trip.id, packSig(trip, s)).catch(() => {});
}

export function PackPanel({ trip, onClose }: { trip: STrip; onClose: () => void }) {
  const s = useData();
  const store = useStoreApi();
  const sig = packSig(trip, s);
  const { data: pack, error } = useLoaded(() => loadPack(trip.id, sig), `${trip.id}|${sig}`);
  const [sel, setSel] = useState<DocInfo["key"]>("cmr");
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const ready = pack?.docs.filter((d) => d.ready) ?? [];
  const doc = pack?.docs.find((d) => d.key === sel) ?? pack?.docs[0];
  const pages = useMemo(() => (pack && doc ? doc.pages.map((i) => pack.pages[i]) : []), [pack, doc]);
  const printPages = useMemo(() => (pack ? ready.flatMap((d) => (d.copies ?? d.pages).map((i) => pack.pages[i])) : []), [pack, ready]);
  const drivers = s.persons.filter((p) => p.kind === "DRIVER" && !p.hidden);
  const [date, setDate] = useState(trip.departDate ?? "");
  useEffect(() => setDate(trip.departDate ?? ""), [trip.departDate]);
  useEffect(() => {
    if (pack && pack.docs.some((d) => d.ready)) markTried("pack");
  }, [pack]);

  const download = async () => {
    setDownloading(true);
    try {
      const r = await fetch(`/api/trips/${trip.id}/pdf?copies=3`);
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `paket-voditelya-${trip.number}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`PDF рейса № ${trip.number}: ${count(printPages.length, "лист", "листа", "листов")}`, "ok");
    } catch (e) {
      toast(e instanceof Error ? e.message : "PDF не скачался", "error");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Sheet onClose={onClose} label="Пакет водителя" width={900} testId="pack-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-5 py-3.5 max-sm:px-4">
        <div className="min-w-0 flex-1 max-md:basis-[calc(100%-48px)]">
          <h2 className="text-[16px] font-semibold">Пакет водителя · рейс № {trip.number}</h2>
          <div className="text-[12.5px] text-[var(--ink-3)]">Складской список, CMR в трёх экземплярах и договоры-заявки одним файлом</div>
        </div>
        <IconButton icon="x" label="Закрыть (Esc)" onClick={onClose} className="md:order-last" />
        {s.me.can.includes("docs.edit") && trip.driverId && (
          <Button
            icon="send"
            disabled={!ready.length}
            data-testid="pack-send"
            onClick={async () => {
              const driver = indexOf(s).person.get(trip.driverId!);
              for (const kind of ["WAREHOUSE", "CMR"] as const) {
                const id = await createDoc(store, kind, { tripId: trip.id });
                const d = id ? indexOf(store.get()).doc.get(id) : null;
                if (d && d.status !== "SIGNED") await sendDoc(store, d.id, driver?.name ?? "водителю");
              }
            }}
          >
            Отправить водителю
          </Button>
        )}
        <Button icon="printer" onClick={() => setPrinting(true)} disabled={!printPages.length} data-testid="pack-print">
          Печать
        </Button>
        <Button variant="primary" icon="download" onClick={() => void download()} disabled={!ready.length || downloading} data-testid="pack-pdf">
          {downloading ? "Собирается…" : "Скачать PDF"}
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[260px_1fr] max-md:grid-cols-1 max-md:overflow-y-auto">
        <div className="border-r border-[var(--line)] p-3 max-md:border-b max-md:border-r-0">
          {!pack && !error && <div className="p-2 text-[13px] text-[var(--ink-3)]">Собираем листы…</div>}
          {error && <div className="p-2 text-[13px] text-[var(--danger)]">{error}</div>}
          {pack?.docs.map((d) => (
            <button key={d.key} onClick={() => setSel(d.key)} className={cx("mb-1 w-full rounded-md px-3 py-2 text-left", sel === d.key ? "bg-[var(--active)]" : "hover:bg-[var(--hover)]")} data-testid={`pack-doc-${d.key}`}>
              <div className="flex items-center gap-2 text-[13.5px] font-medium">
                <span className="flex-1">{d.title}</span>
                {d.ready ? <Icon name="check" size={14} className="text-[var(--ok)]" /> : d.empty ? null : <span className="text-[12px] font-normal text-[var(--warn)]">не готов</span>}
              </div>
              <div className="text-[12px] text-[var(--ink-3)]">{d.key === "cmr" ? `${d.sub}` : d.sub}</div>
            </button>
          ))}
          {doc && doc.missing.length > 0 && (
            <div className="mt-3 rounded-md border border-[var(--warn)]/40 bg-[var(--warn-soft)] p-3 text-[13px]" data-testid="pack-missing">
              <div className="font-medium">Осталось {count(doc.missing.length, "поле", "поля", "полей")}</div>
              {doc.missing.map((m) => (
                <div key={m.key} className="mt-2">
                  <div className="text-[12px] text-[var(--ink-2)]">
                    {m.label} <span className="text-[var(--ink-3)]">({m.hint})</span>
                  </div>
                  {m.input === "date" && (
                    <div className="mt-1 flex gap-1.5">
                      <DateField value={date} min={s.today} onChange={setDate} label="Дата выезда" testId="pack-date" />
                      <Button size="sm" variant="primary" disabled={!date} onClick={() => void updateTrip(store, trip.id, { departDate: date })} data-testid="pack-date-save">
                        Готово
                      </Button>
                    </div>
                  )}
                  {m.input === "driver" && (
                    <select className="field mt-1" defaultValue="" onChange={(e) => e.target.value && void updateTrip(store, trip.id, { driverId: e.target.value })}>
                      <option value="">Выберите водителя</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {m.input === "text" && <div className="mt-1 text-[12px] text-[var(--ink-3)]">Заполняется в настройках.</div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="min-h-0 overflow-y-auto bg-[var(--surface-2)] p-5 max-sm:p-3" data-testid="pack-preview">
          {pages.length > 0 ? <Pages pages={pages} /> : <div className="p-6 text-center text-[13px] text-[var(--ink-3)]">{pack ? "В рейсе нет заявок: печатать нечего." : ""}</div>}
        </div>
      </div>
      {printing && <PrintRoot pages={printPages} onDone={() => setPrinting(false)} />}
    </Sheet>
  );
}

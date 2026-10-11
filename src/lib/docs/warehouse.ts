import "server-only";
import { count, fmtFixed, fmtNum } from "../money";
import { orderLabel } from "../numbering";
import { fmtWindow, palletPlaces } from "../freight";
import { fmtDayLong, fromDbDate } from "../time";
import { Page } from "./builder";
import { wrap } from "./measure";
import type { TripDoc } from "./data";
import { A4L } from "./types";

const L = 10;
const R = A4L.w - 10;
const SIZE = 7;
const LH = SIZE * 0.3528 * 1.3;
const GRAY = "#555c57";

type Col = { key: string; title: string; w: number; align?: "left" | "right" | "center" };

const COLS: Col[] = [
  { key: "n", title: "№", w: 8, align: "center" },
  { key: "no", title: "Заявка", w: 19 },
  { key: "client", title: "Клиент", w: 34 },
  { key: "cargo", title: "Груз", w: 28 },
  { key: "pack", title: "Палеты, места", w: 22, align: "right" },
  { key: "kg", title: "Вес, кг", w: 15, align: "right" },
  { key: "m3", title: "Объём, м³", w: 15, align: "right" },
  { key: "load", title: "Загрузка", w: 36 },
  { key: "unload", title: "Выгрузка", w: 40 },
  { key: "recipient", title: "Получатель", w: 32 },
  { key: "note", title: "Примечание", w: 14 },
  { key: "ok", title: "Погружено", w: 14 },
];
// ширина колонок ровно на лист
COLS[COLS.length - 1].w = R - L - COLS.slice(0, -1).reduce((s, c) => s + c.w, 0);

/** Складской список по рейсу: таблица в порядке погрузки, шапка на каждой странице */
export function buildWarehouse(t: TripDoc): Page[] {
  const pages: Page[] = [];
  const depart = fromDbDate(t.departDate);
  const outbound = t.route.fromCountry === "RU";
  const header = (p: Page, first: boolean) => {
    let y = 10;
    if (first) {
      p.text(L, y, 150, `Складской список № ${t.number}-1`, { size: 15, weight: 700 });
      p.text(R - 140, y + 1, 140, `${outbound ? "отгрузка со склада в Подмосковье" : "отгрузка со склада в Минске"}, ${t.company.shortName}`, { size: 8, align: "right", color: GRAY, max: 2 });
      y += 9;
      const facts: [string, string, string][] = [
        ["Направление", `${t.route.fromCity} → ${t.route.toCity}, ${t.route.distanceKm} км`, "route"],
        ["Дата выезда", depart ? fmtDayLong(depart) : "не указана", "depart"],
        ["Водитель", t.driver ? `${t.driver.name}, ${t.driver.phone}` : "не выбран", "driver"],
        ["Машина", t.vehicle ? `${t.vehicle.title}, ${t.vehicle.plate ?? "без номера"}${t.vehicle.trailerPlate ? ` / ${t.vehicle.trailerPlate}` : ""}` : "не указана", "plate"],
      ];
      const fw = (R - L) / 4;
      facts.forEach(([k, v, key], i) => {
        p.text(L + i * fw, y, fw - 4, k, { size: 6.4, color: GRAY });
        p.text(L + i * fw, y + 3, fw - 4, v, { size: 8.4, weight: 600, max: 2, key: `wh-${key}`, value: true });
      });
      y += 11;
    } else {
      p.text(L, y, 200, `Складской список № ${t.number}-1, продолжение`, { size: 9, weight: 600 });
      y += 6;
    }
    p.rect(L, y, R - L, 6.4, { fill: "#eef0ec", stroke: 0.3 });
    let x = L;
    for (const c of COLS) {
      p.text(x + 1.2, y + 1.7, c.w - 2.4, c.title, { size: 6.4, weight: 600, align: c.align === "right" ? "right" : c.align === "center" ? "center" : "left", max: 1 });
      x += c.w;
    }
    return y + 6.4;
  };

  let page = new Page(A4L.w, A4L.h, "warehouse", "Складской список", `${t.number}-1`);
  pages.push(page);
  let y = header(page, true);
  const bottom = A4L.h - 11;

  const rows = t.orders.map((o, i) => {
    const when = (from: Date | null, to: Date | null, time: string | null) => {
      const a = fromDbDate(from);
      return a ? `${fmtWindow(a, fromDbDate(to))}${time ? ` ${time}` : ""}` : "";
    };
    const cells: Record<string, string> = {
      n: String(i + 1),
      no: orderLabel(o.seq),
      client: `${o.client.name}, ${o.client.phones[0] ?? ""}`,
      cargo: o.cargo,
      pack: o.pallets > 0 ? `${o.pallets} пал.` : `${o.places} мест${o.dims ? `\n${o.dims}` : ""}`,
      kg: fmtFixed(o.weightKg, 0),
      m3: fmtFixed(o.volumeM3, 1),
      load: [`${o.loadCity}${o.loadAddress ? `, ${o.loadAddress.replace(/^г\. [^,]+, /, "")}` : ""}`, when(o.loadFrom, o.loadTo, o.loadTime)].filter(Boolean).join("\n"),
      unload: [`${o.unloadCity}${o.unloadAddress ? `, ${o.unloadAddress.replace(/^г\. [^,]+, /, "")}` : ""}`, when(o.unloadFrom, o.unloadTo, o.unloadTime)].filter(Boolean).join("\n"),
      recipient: o.recipientName ? [o.recipientName, o.recipientPhone].filter(Boolean).join(", ") : "клиент сам",
      note: o.comment ?? "",
      ok: "",
    };
    const wrapped = Object.fromEntries(COLS.map((c) => [c.key, wrap(cells[c.key], c.w - 2.4, SIZE, c.key === "no" ? 600 : 400, c.key === "note" ? 6 : 4)]));
    const lines = Math.max(...COLS.map((c) => wrapped[c.key].length), 1);
    return { o, wrapped, h: lines * LH + 2.6 };
  });

  rows.forEach((r, i) => {
    const need = r.h + (i === rows.length - 1 ? 18 : 0);
    if (y + need > bottom) {
      page = new Page(A4L.w, A4L.h, "warehouse", "Складской список", `${t.number}-1`);
      pages.push(page);
      y = header(page, false);
    }
    let x = L;
    page.line(L, y + r.h, R, y + r.h, 0.2, false, "#9aa09b");
    for (const c of COLS) {
      const lines = r.wrapped[c.key];
      if (c.key === "ok") page.rect(x + c.w / 2 - 1.8, y + 1.2, 3.6, 3.6, { stroke: 0.3 });
      if (lines.length && lines[0]) page.els.push({ t: "text", x: x + (c.align === "right" ? 1.2 : 2), y: y + 1.3, w: c.w - 3.2, lines, size: SIZE, weight: c.key === "no" ? 600 : 400, align: c.align ?? "left", lh: LH, value: true, key: `wh-${r.o.id}-${c.key}` });
      x += c.w;
    }
    y += r.h;
  });
  const pal = t.orders.reduce((s, o) => s + palletPlaces(o), 0);
  const kg = t.orders.reduce((s, o) => s + o.weightKg, 0);
  const m3 = t.orders.reduce((s, o) => s + o.volumeM3, 0);
  if (y + 16 > A4L.h - 9) {
    page = new Page(A4L.w, A4L.h, "warehouse", "Складской список", `${t.number}-1`);
    pages.push(page);
    y = header(page, false);
  }
  page.rect(L, y, R - L, 6.4, { fill: "#eef0ec", stroke: 0.3 });
  page.text(L + 1.2, y + 1.7, 100, `Итого: ${count(t.orders.length, "order")}`, { size: 7, weight: 700 });
  const xs = COLS.reduce<number[]>((acc, c, i) => (acc.push((acc[i - 1] ?? L) + (i ? COLS[i - 1].w : 0)), acc), []);
  const put = (key: string, v: string) => {
    const i = COLS.findIndex((c) => c.key === key);
    page.text(xs[i] + 1.2, y + 1.7, COLS[i].w - 2.4, v, { size: 7, weight: 700, align: "right", value: true, key: `wh-total-${key}` });
  };
  put("pack", `${fmtNum(pal, 0)} пал.-мест`);
  put("kg", fmtFixed(kg, 0));
  put("m3", fmtFixed(m3, 1));
  y += 10;
  page.text(L, y, 130, "Отгрузил со склада ______________________  ФИО, дата ______________", { size: 7.5 });
  page.text(L + 140, y, 130, "Водитель ______________________  дата ______________", { size: 7.5 });
  if (t.vehicle) page.text(L, y + 5, R - L, `Машина ${t.vehicle.title}: занято ${fmtNum(kg / 1000, 1)} из ${fmtNum(t.vehicle.capacityKg / 1000, 0)} т, ${fmtNum(m3, 1)} из ${fmtNum(t.vehicle.volumeM3, 0)} м³, ${pal} из ${t.vehicle.pallets} палетомест.`, { size: 6.4, color: GRAY, key: "wh-cap", value: true });

  pages.forEach((p, i) => {
    p.text(R - 60, A4L.h - 8, 60, `Лист ${i + 1} из ${pages.length}`, { size: 6.4, color: GRAY, align: "right" });
  });
  return pages;
}

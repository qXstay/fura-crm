import "server-only";
import { buildContract } from "./contract";
import { buildCmr, CMR_COPIES } from "./cmr";
import { checklist, type TripDoc } from "./data";
import { buildWarehouse } from "./warehouse";
import type { DocInfo, DocPack, DocPage } from "./types";
import { count, pl } from "../money";

/** Обычно три экземпляра CMR: отправителю, получателю, перевозчику */
export const DEFAULT_CMR_COPIES = 3;

/** Пакет водителя: складской список, CMR в трёх экземплярах, договоры-заявки пачкой */
export function buildTripPack(t: TripDoc): DocPack {
  const check = checklist(t);
  const pages: DocPage[] = [];
  const docs: DocInfo[] = [];
  const add = (key: DocInfo["key"], title: string, sub: string, list: DocPage[], missing: DocInfo["missing"]) => {
    const start = pages.length;
    pages.push(...list);
    const empty = t.orders.length === 0;
    docs.push({ key, title, sub: empty ? "в рейсе нет заявок" : sub, pages: list.map((_, i) => start + i), ready: missing.length === 0 && list.length > 0 && !empty, missing, empty });
  };
  const wh = buildWarehouse(t).map((p) => p.done());
  add("warehouse", `Складской список № ${t.number}-1`, `${pl(t.orders.length, "строка", "строки", "строк")}, ${pl(wh.length, "лист", "листа", "листов")}`, wh, check.warehouse);
  const missingKeys = new Set(check.cmr.map((m) => m.key));
  add("cmr", `CMR № ${t.number}-2`, `одна на рейс, ${count(DEFAULT_CMR_COPIES, "copy")}`, [buildCmr(t, missingKeys, 1).done()], check.cmr);
  // остальные экземпляры CMR: только для печати и PDF
  const cmrDoc = docs[docs.length - 1];
  cmrDoc.copies = [cmrDoc.pages[0]];
  for (let c = 2; c <= CMR_COPIES.length; c++) {
    cmrDoc.copies.push(pages.length);
    pages.push(buildCmr(t, missingKeys, c).done());
  }
  const trip = { ...t, driver: t.driver, vehicle: t.vehicle };
  const contracts = t.orders.map((o) => buildContract({ order: o, trip, company: t.company }).done());
  add("contract", "Договоры-заявки", contracts.length ? `${pl(contracts.length, "лист", "листа", "листов")}, по листу на заявку` : "в рейсе нет заявок", contracts, t.orders.length ? check.contract : []);
  return { docs, pages, tripId: t.id, tripNo: t.number };
}

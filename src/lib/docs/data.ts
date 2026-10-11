import "server-only";
import type { Entity, Prisma } from "@prisma/client";
import { prisma } from "../db";
import type { Missing } from "./types";

export const tripDocInclude = {
  route: true,
  driver: true,
  vehicle: true,
  orders: { include: { client: true, route: true }, orderBy: { loadIndex: "asc" } },
} satisfies Prisma.TripInclude;

export type TripRow = Prisma.TripGetPayload<{ include: typeof tripDocInclude }>;
export type TripDoc = TripRow & { company: Entity };
export type OrderDoc = Prisma.OrderGetPayload<{ include: { client: true; route: true; trip: { include: { driver: true; vehicle: true } } } }> & { company: Entity };

export async function loadTripDoc(id: string): Promise<TripDoc | null> {
  const [t, company] = await Promise.all([prisma.trip.findUnique({ where: { id }, include: tripDocInclude }), prisma.entity.findFirst()]);
  if (!t || !company) return null;
  return { ...t, company };
}

export async function loadOrderDoc(id: string): Promise<OrderDoc | null> {
  const [o, company] = await Promise.all([prisma.order.findUnique({ where: { id }, include: { client: true, route: true, trip: { include: { driver: true, vehicle: true } } } }), prisma.entity.findFirst()]);
  if (!o || !company) return null;
  return { ...o, company };
}

export const COUNTRY_NAME: Record<string, string> = { BY: "Республика Беларусь", RU: "Российская Федерация" };
export const COUNTRY_EN: Record<string, string> = { BY: "Belarus", RU: "Russia" };

/** Сторона компании в стране: в России офис и склад в Подмосковье, в Беларуси представительство и склад в Минске */
export type Side = { key: string; name: string; address: string; tax: string; bank: string | null; country: "RU" | "BY" };

export function sideOf(c: Entity, country: "RU" | "BY"): Side {
  if (country === "RU") {
    return {
      key: "ru",
      name: c.fullName,
      address: c.warehouseRu,
      tax: `ИНН ${c.taxId}${c.kpp ? `, КПП ${c.kpp}` : ""}`,
      bank: `р/с ${c.account} в ${c.bankName}, БИК ${c.bankCode}`,
      country: "RU",
    };
  }
  return { key: "by", name: c.byName, address: c.warehouseBy, tax: `УНП ${c.byTaxId}`, bank: null, country: "BY" };
}

/** Реквизиты компании для шапки документов */
export function requisites(c: Entity): string[] {
  return [c.fullName, c.address, `ИНН ${c.taxId}${c.kpp ? `, КПП ${c.kpp}` : ""}`, `р/с ${c.account} в ${c.bankName}, БИК ${c.bankCode}`];
}

const COMPANY_FIELDS: { key: keyof Entity; label: string; where: string }[] = [
  { key: "fullName", label: "полное наименование компании", where: "CMR графы 1 и 16, договор-заявка" },
  { key: "taxId", label: "ИНН компании", where: "CMR графа 1, договор-заявка" },
  { key: "warehouseRu", label: "адрес склада в России", where: "CMR графы 1, 3 и 4" },
  { key: "byName", label: "представительство в Беларуси", where: "CMR графа 2" },
  { key: "warehouseBy", label: "адрес склада в Беларуси", where: "CMR графы 2, 3 и 4" },
  { key: "account", label: "расчётный счёт", where: "договор-заявка, счёт" },
];

function companyMissing(c: Entity): Missing[] {
  return COMPANY_FIELDS.filter((f) => !String(c[f.key] ?? "").trim()).map((f) => ({ key: `company:${String(f.key)}`, label: `Компания: ${f.label}`, input: "text" as const, hint: f.where }));
}

/** Чек-лист: каких данных не хватает документам рейса */
export function checklist(t: TripDoc) {
  const date: Missing[] = t.departDate ? [] : [{ key: "departDate", label: "Дата выезда", input: "date", hint: "CMR графа 4, складской список, договоры-заявки" }];
  const driver: Missing[] = t.driver ? [] : [{ key: "driver", label: "Водитель", input: "driver", hint: "CMR графа 16, договоры-заявки" }];
  const plate: Missing[] = t.vehicle?.plate ? [] : [{ key: "plate", label: "Госномер машины", input: "text", hint: "CMR графа 25, складской список" }];
  const company = companyMissing(t.company);
  const uniq = (list: Missing[]) => [...new Map(list.map((m) => [m.key, m])).values()];
  return {
    warehouse: uniq([...date, ...driver, ...plate]),
    cmr: uniq([...date, ...driver, ...plate, ...company]),
    contract: uniq([...date, ...driver, ...plate, ...company.filter((m) => m.key !== "company:byName" && m.key !== "company:warehouseBy")]),
  };
}

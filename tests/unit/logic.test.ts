import { describe, expect, it } from "vitest";
import { addReason, bodyFits, dirCode, fitReason, fmtReady, fmtWindow, loadOf, overloaded, palletPlaces, type AddOrder } from "@/lib/freight";
import { distanceFor, hubOf, suggestCities } from "@/lib/geo";
import { isValidInn10, isValidRuAccount, isValidUnp } from "@/lib/world/ids";
import { CLIENTS, COMPANY, PERSONS, VEHICLES, ROUTES } from "@/lib/world/reference";

const truck = VEHICLES.find((v) => v.id === "v1")!;

describe("груз, кузов и место в машине", () => {
  it("палетоместа: палеты как есть, места по габаритам 1,2×0,8", () => {
    expect(palletPlaces({ pallets: 6, places: 6, volumeM3: 9 })).toBe(6);
    expect(palletPlaces({ pallets: 0, places: 2, dims: "1,2х0,8х1,4", volumeM3: 2.7 })).toBe(2);
    expect(palletPlaces({ pallets: 0, places: 1, dims: "2х1,2х1,8", volumeM3: 4.3 })).toBe(3);
  });
  it("кузов: реф только в реф, сверху и сбоку только под тент, закр.+терм. в любой", () => {
    expect(bodyFits({ body: "REF", loading: "задн." }, { body: "TENT" })).toBe(false);
    expect(bodyFits({ body: "CLOSED", loading: "задн." }, { body: "VAN" })).toBe(true);
    expect(bodyFits({ body: "CLOSED", loading: "верх. бок." }, { body: "VAN" })).toBe(false);
    expect(bodyFits({ body: "TENT", loading: "верх. бок." }, { body: "TENT" })).toBe(true);
  });
  it("не влезет: по весу, объёму или палетам, с причиной словами", () => {
    const full = loadOf([{ pallets: 30, places: 30, weightKg: 12000, volumeM3: 40 }]);
    expect(fitReason(full, truck, { pallets: 3, places: 3, weightKg: 900, volumeM3: 4 })).toBeNull();
    expect(fitReason(full, truck, { pallets: 4, places: 4, weightKg: 900, volumeM3: 4 })).toMatch(/палеты: свободно 3, нужно 4/);
    expect(fitReason(full, truck, { pallets: 2, places: 2, weightKg: 8500, volumeM3: 4 })).toMatch(/вес/);
    expect(overloaded(loadOf([{ pallets: 34, places: 34, weightKg: 100, volumeM3: 1 }]), truck)).toBe(true);
    expect(overloaded(loadOf([{ pallets: 33, places: 33, weightKg: 20000, volumeM3: 82 }]), truck)).toBe(false);
  });
  it("заявку в рейс нельзя, если не то направление, отдельная машина или рейс уехал", () => {
    const o: AddOrder = { tripId: null, archived: false, status: "ACCEPTED", routeId: "r-mow-msq", body: "TENT", loading: "задн.", separate: false, pallets: 1, places: 1, weightKg: 300, volumeM3: 1.5 };
    const t = { id: "t", routeId: "r-mow-msq", status: "PLANNED", vehicle: truck, orders: [{ pallets: 1, places: 1, weightKg: 100, volumeM3: 1, separate: false }] };
    expect(addReason(o, t)).toBeNull();
    expect(addReason({ ...o, routeId: "r-mow-bqt" }, t)).toBe("другое направление");
    expect(addReason({ ...o, separate: true }, t)).toBe("нужна отдельная машина");
    expect(addReason(o, { ...t, status: "IN_TRANSIT" })).toBe("рейс уже уехал");
    expect(addReason({ ...o, body: "REF" }, t)).toMatch(/кузов/);
  });
  it("евро-палет в 20-тонник не больше 33, у всех машин по три поперёк", () => {
    for (const v of VEHICLES) {
      expect(v.pallets).toBeLessThanOrEqual(33);
      expect(Math.floor(v.widthM / 0.8 + 1e-6) * Math.floor(v.lengthM / 1.2 + 1e-6)).toBeGreaterThanOrEqual(v.pallets);
      // объём кузова сходится с размерами
      expect(Math.abs(v.lengthM * v.widthM * v.heightM - v.volumeM3) / v.volumeM3).toBeLessThan(0.03);
    }
  });
});

describe("даты и направление строкой", () => {
  it("«готов 12-13 окт.» и «готов 12 окт. 9:00-17:00»", () => {
    expect(fmtReady("2026-10-12", "2026-10-13")).toBe("готов 12-13 окт.");
    expect(fmtReady("2026-10-12", null, "9:00-17:00")).toBe("готов 12 окт. 9:00-17:00");
    expect(fmtWindow("2026-09-30", "2026-10-02")).toBe("30 сен. - 2 окт.");
    expect(dirCode("RU", "BY")).toBe("RUS-BLR");
  });
  it("расстояния близко к реальным", () => {
    expect(ROUTES.find((r) => r.id === "r-mow-msq")!.distanceKm).toBe(715);
    expect(distanceFor(715, "Химки", "Минск")).toBe(735);
    expect(distanceFor(715, "Москва", "Борисов")).toBe(640);
    expect(hubOf("Борисов")).toBe("Минск");
  });
});

describe("подсказки городов", () => {
  it("по «Минск» первым город Минск, деревня Минск ниже всех городов", () => {
    const s = suggestCities("Минск");
    expect(s[0]).toMatchObject({ city: "Минск", kind: "г.", country: "BY" });
    const firstVillage = s.findIndex((h) => h.kind !== "г.");
    const lastTown = s.map((h) => h.kind).lastIndexOf("г.");
    expect(firstVillage).toBeGreaterThan(lastTown);
  });
  it("по «Моск» первой Москва-город, по «Брест» Брест-город", () => {
    expect(suggestCities("Моск")[0]).toMatchObject({ city: "Москва", kind: "г." });
    expect(suggestCities("брест")[0]).toMatchObject({ city: "Брест", kind: "г." });
  });
});

describe("вымышленные данные", () => {
  it("ИНН, УНП и счета компании и клиентов не проходят проверку", () => {
    expect(isValidInn10(COMPANY.taxId)).toBe(false);
    expect(isValidUnp(COMPANY.byTaxId)).toBe(false);
    expect(isValidRuAccount(COMPANY.bankCode, COMPANY.account)).toBe(false);
    for (const c of CLIENTS.filter((x) => x.kind === "COMPANY")) {
      if (c.residency === "RU") expect(isValidInn10(c.taxId!)).toBe(false);
      else expect(isValidUnp(c.taxId!)).toBe(false);
    }
  });
  it("телефоны вида +7 900 000-… и +375 29 000-…, почты @example.com, госномера с регионом 00", () => {
    for (const p of [...PERSONS.map((x) => x.phone), ...CLIENTS.flatMap((c) => c.phones)]) expect(p).toMatch(/^\+(7 900|375 29) 000-\d\d-\d\d$/);
    for (const c of CLIENTS) if (c.email) expect(c.email).toMatch(/@([a-z-]+\.)?example\.com$/);
    for (const v of VEHICLES) expect(v.plate).toMatch(/ 00$/);
  });
  it("одна компания и рубли: белорусских рублей в справочниках нет", () => {
    const text = JSON.stringify({ COMPANY, CLIENTS, ROUTES, VEHICLES });
    expect(text).not.toMatch(/BYN|бел\. ?руб|белорусск\S* рубл/);
  });
});

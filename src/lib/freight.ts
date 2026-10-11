// Груз, кузов и вместимость. Работает и на сервере, и в браузере: без базы и без Node.

export type BodyCode = "TENT" | "REF" | "VAN" | "CLOSED";

/** Как пишут кузов в строке груза */
export const BODY_SHORT: Record<BodyCode, string> = { TENT: "тент.", REF: "реф.", VAN: "цельнометалл.", CLOSED: "закр.+терм." };
/** Кузов машины словом */
export const BODY_WORD: Record<BodyCode, string> = { TENT: "тент", REF: "реф", VAN: "цельнометалл.", CLOSED: "закрытый" };
/** Кузов в карточке груза полностью */
export const BODY_LONG: Record<BodyCode, string> = { TENT: "тентованный (тент.)", REF: "рефрижератор (реф.)", VAN: "цельнометаллический (цельнометалл.)", CLOSED: "любой закрытый или изотермический (закр.+терм.)" };

export const LOADING_OPTIONS = ["задн.", "верх. бок.", "бок. задн."] as const;
export const LOADING_LONG: Record<string, string> = { "задн.": "задняя", "верх. бок.": "верхняя, боковая", "бок. задн.": "боковая, задняя" };

/** Евро-палета 1,2 × 0,8 м */
export const PALLET_L = 1.2;
export const PALLET_W = 0.8;
const EPS = 1e-6;

/** Подходит ли кузов машины грузу */
export function bodyFits(order: { body: BodyCode; loading: string }, vehicle: { body: BodyCode } | null | undefined): boolean {
  if (!vehicle) return true;
  // сверху и сбоку грузят только под тент
  if (order.loading.includes("верх") || order.loading.startsWith("бок")) {
    if (vehicle.body !== "TENT") return false;
  }
  if (order.body === "CLOSED") return true;
  return order.body === vehicle.body;
}

/** Габариты одного места: «1,2х0,8х1,4» → [1.2, 0.8, 1.4] */
export function parseDims(s: string | null | undefined): [number, number, number] | null {
  if (!s) return null;
  const parts = s.replace(/,/g, ".").split(/[xх×*]/i).map((x) => Number(x.trim()));
  if (parts.length !== 3 || parts.some((x) => !(x > 0))) return null;
  return parts as [number, number, number];
}

export function fmtDims(d: [number, number, number]): string {
  return d.map((x) => String(Math.round(x * 100) / 100).replace(".", ",")).join("х");
}

export type CargoLike = { pallets: number; places: number; dims?: string | null; volumeM3: number };

/** Сколько палетомест на полу занимает груз */
export function palletPlaces(o: CargoLike): number {
  if (o.pallets > 0) return o.pallets;
  const d = parseDims(o.dims);
  if (d) return Math.max(1, o.places) * Math.ceil((d[0] * d[1]) / (PALLET_L * PALLET_W) - EPS);
  // коробы без палет: по объёму, палетоместо высотой около 1,6 м
  return Math.max(1, Math.ceil(o.volumeM3 / 1.6 - EPS));
}

export type Cap = { capacityKg: number; volumeM3: number; pallets: number };
export type LoadItem = CargoLike & { weightKg: number };
export type Load = { kg: number; m3: number; pal: number };

export function loadOf(items: LoadItem[]): Load {
  let kg = 0;
  let m3 = 0;
  let pal = 0;
  for (const i of items) {
    kg += i.weightKg;
    m3 += i.volumeM3;
    pal += palletPlaces(i);
  }
  return { kg: Math.round(kg * 10) / 10, m3: Math.round(m3 * 100) / 100, pal };
}

export function freeOf(load: Load, cap: Cap): Load {
  return { kg: cap.capacityKg - load.kg, m3: Math.round((cap.volumeM3 - load.m3) * 100) / 100, pal: cap.pallets - load.pal };
}

export function overloaded(load: Load, cap: Cap): boolean {
  return load.kg > cap.capacityKg + EPS || load.m3 > cap.volumeM3 + EPS || load.pal > cap.pallets;
}

/** Влезет ли груз в рейс: по весу, объёму и палетам. Причина словами, если нет. */
export function fitReason(current: Load, cap: Cap, add: LoadItem): string | null {
  const free = freeOf(current, cap);
  const need = palletPlaces(add);
  const parts: string[] = [];
  if (add.weightKg > free.kg + EPS) parts.push(`вес: свободно ${tons(Math.max(0, free.kg))} т, нужно ${tons(add.weightKg)} т`);
  if (add.volumeM3 > free.m3 + EPS) parts.push(`объём: свободно ${num(Math.max(0, free.m3))} м³, нужно ${num(add.volumeM3)} м³`);
  if (need > free.pal) parts.push(`палеты: свободно ${Math.max(0, free.pal)}, нужно ${need}`);
  return parts.length ? `Не влезет, ${parts.join("; ")}` : null;
}

export function tons(kg: number): string {
  return num(Math.round(kg / 100) / 10);
}

export function num(n: number, digits = 1): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(n).replace(/\s/g, " ");
}

// ---------- Можно ли поставить заявку в рейс ----------

export type AddOrder = LoadItem & { tripId: string | null; archived: boolean; status: string; routeId: string; body: BodyCode; loading: string; separate: boolean };
export type AddTrip = { id: string; routeId: string; status: string; vehicle: (Cap & { body: BodyCode }) | null; orders: (LoadItem & { separate: boolean })[] };

const STATUS_WORD: Record<string, string> = { IN_TRANSIT: "В пути", AT_WAREHOUSE: "На складе", WITH_COURIER: "У курьера", DELIVERED: "Выдано", CANCELLED: "Отменена" };

/** Почему заявку нельзя поставить в рейс. null значит можно: рейс останется не перегруженным. */
export function addReason(o: AddOrder, t: AddTrip): string | null {
  if (t.status !== "PLANNED") return "рейс уже уехал";
  if (o.tripId === t.id) return "уже в этом рейсе";
  if (o.tripId) return "уже в другом рейсе";
  if (o.archived) return "в архиве";
  if (o.status !== "ACCEPTED") return `статус «${STATUS_WORD[o.status] ?? o.status}»`;
  if (o.routeId !== t.routeId) return "другое направление";
  if (!bodyFits(o, t.vehicle)) return `кузов: нужен ${o.body === "REF" ? "реф" : "тент"}, а машина ${BODY_WORD[t.vehicle!.body]}`;
  if (o.separate && t.orders.length) return "нужна отдельная машина";
  if (t.orders.some((x) => x.separate)) return "в рейсе груз на отдельной машине";
  if (t.vehicle) {
    const why = fitReason(loadOf(t.orders), t.vehicle, o);
    if (why) return why.replace(/^Не влезет, /, "не влезет: ");
  }
  return null;
}

// Ставка, НДС и деньги в публичную часть не входят.

// ---------- Даты строкой как в поиске грузов ----------

const MON = ["янв.", "фев.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сен.", "окт.", "ноя.", "дек."];
const MON_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function parts(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

/** «12 окт.», «12-13 окт.», «30 сен. - 2 окт.» */
export function fmtWindow(from: string | null | undefined, to?: string | null): string {
  if (!from) return "";
  const a = parts(from);
  if (!to || to === from) return `${a.day} ${MON[a.m - 1]}`;
  const b = parts(to);
  if (a.m === b.m) return `${a.day}-${b.day} ${MON[a.m - 1]}`;
  return `${a.day} ${MON[a.m - 1]} - ${b.day} ${MON[b.m - 1]}`;
}

/** «готов 12-13 окт.» или «готов 12 окт. 9:00-17:00» */
export function fmtReady(from: string | null | undefined, to?: string | null, time?: string | null): string {
  if (!from) return "";
  return `готов ${fmtWindow(from, to)}${time ? ` ${time}` : ""}`;
}

/** «11 окт» без точки: для номера рейса «№ 173 · 11 окт» */
export function fmtDayShort(d: string | null | undefined): string {
  if (!d) return "";
  const a = parts(d);
  return `${a.day} ${MON_SHORT[a.m - 1]}`;
}

/** «RUS-BLR» */
export function dirCode(from: "RU" | "BY", to: "RU" | "BY"): string {
  const c = { RU: "RUS", BY: "BLR" };
  return from === to ? c[from] : `${c[from]}-${c[to]}`;
}

// Расчёт рейса (время, топливо, «Платон») в публичную часть не входит.

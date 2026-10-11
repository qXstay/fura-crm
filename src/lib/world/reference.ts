import type { Body, ClientKind, Country, PersonKind, Role } from "@prisma/client";
import { fakeInn10, fakeKpp, fakeRuAccount, fakeUnp } from "./ids";
import { BY_PLACES, MOSCOW_PLACES, type Place } from "../geo";

// Всё ниже выдумано: компания, люди, адреса, номера, счета.

const BIK = "044500000";

/** Одна компания-перевозчик: контора в Москве, склад в Подмосковье, представительство и склад в Минске */
export const COMPANY = {
  id: "ent-zk",
  shortName: "Журавлиный Ключ",
  fullName: "Общество с ограниченной ответственностью «Журавлиный Ключ»",
  country: "RU" as Country,
  taxId: fakeInn10("770931586"),
  kpp: fakeKpp("7709"),
  address: "109316, Российская Федерация, г. Москва, ул. Лодочная Слобода, 9, стр. 2",
  bankName: "АО «Банк Северная пристань», г. Москва",
  bankCode: BIK,
  account: fakeRuAccount(BIK, "40702810", "00000077411"),
  director: "Северинов Виктор Павлович",
  phone: "+7 900 000-10-01",
  email: "office@zhuravl-klyuch.example.com",
  warehouseRu: "142700, Российская Федерация, Московская обл., г. Видное, ул. Складская Пустошь, 7",
  byName: "Представительство ООО «Журавлиный Ключ» в Республике Беларусь",
  byTaxId: fakeUnp("19274130"),
  warehouseBy: "220089, Республика Беларусь, г. Минск, ул. Складская Полянка, 14",
};

export type { Place };
export { MOSCOW_PLACES, BY_PLACES };

export type RouteDef = { id: string; fromCity: string; fromCountry: Country; toCity: string; toCountry: Country; distanceKm: number; ruKm: number; sortOrder: number };

const CITY_CODE: Record<string, string> = { Москва: "mow", Минск: "msq", Брест: "bqt", Гомель: "gme", Витебск: "vtb", Гродно: "gna", Могилёв: "mvq" };

/** Москва - город Беларуси: км по трассе всего и км по России (на них «Платон») */
const PAIRS: [string, number, number][] = [
  ["Минск", 715, 455],
  ["Брест", 1060, 455],
  ["Гомель", 660, 600],
  ["Витебск", 520, 465],
  ["Гродно", 990, 455],
  ["Могилёв", 590, 455],
];

export function routeId(from: string, to: string): string {
  return `r-${CITY_CODE[from]}-${CITY_CODE[to]}`;
}

export const ROUTES: RouteDef[] = PAIRS.flatMap(([by, km, ru], i) => [
  { id: routeId("Москва", by), fromCity: "Москва", fromCountry: "RU" as Country, toCity: by, toCountry: "BY" as Country, distanceKm: km, ruKm: ru, sortOrder: i * 2 + 1 },
  { id: routeId(by, "Москва"), fromCity: by, fromCountry: "BY" as Country, toCity: "Москва", toCountry: "RU" as Country, distanceKm: km, ruKm: ru, sortOrder: i * 2 + 2 },
]);

/** Точки направления: откуда и куда может ехать заявка этого направления */
export function placesOf(r: Pick<RouteDef, "fromCity" | "toCity">): { from: Place[]; to: Place[] } {
  const side = (city: string) => (city === "Москва" ? MOSCOW_PLACES : BY_PLACES[city]);
  return { from: side(r.fromCity), to: side(r.toCity) };
}

// Тарифы направлений в публичную часть не входят.

export type VehicleDef = {
  id: string;
  brand: string;
  title: string;
  body: Body;
  frame: string;
  plate: string;
  trailerPlate: string | null;
  plateCountry: Country;
  capacityKg: number;
  volumeM3: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  pallets: number;
};

/** Пять машин. Палеты: евро 1,2×0,8, по три поперёк кузова */
export const VEHICLES: VehicleDef[] = [
  { id: "v1", brand: "MAN TGX 18.470", title: "тент 20 т 82 м³", body: "TENT", frame: "полупр.", plate: "М 482 АК 00", trailerPlate: "АК 3517 00", plateCountry: "RU", capacityKg: 20000, volumeM3: 82, lengthM: 13.6, widthM: 2.45, heightM: 2.46, pallets: 33 },
  { id: "v2", brand: "Volvo FH 460", title: "тент 20 т 92 м³ (мега)", body: "TENT", frame: "полупр.", plate: "Е 730 НН 00", trailerPlate: "АМ 6042 00", plateCountry: "RU", capacityKg: 20000, volumeM3: 92, lengthM: 13.6, widthM: 2.48, heightM: 2.72, pallets: 33 },
  { id: "v3", brand: "Scania R 450", title: "реф 18 т 80 м³", body: "REF", frame: "полупр.", plate: "В 196 ВС 00", trailerPlate: "АТ 8820 00", plateCountry: "RU", capacityKg: 18000, volumeM3: 80, lengthM: 13.3, widthM: 2.46, heightM: 2.45, pallets: 33 },
  { id: "v4", brand: "DAF LF 290", title: "тент 10 т 45 м³", body: "TENT", frame: "грузовик", plate: "О 551 РР 00", trailerPlate: null, plateCountry: "RU", capacityKg: 10000, volumeM3: 45, lengthM: 7.2, widthM: 2.45, heightM: 2.55, pallets: 18 },
  { id: "v5", brand: "Iveco Eurocargo 120E", title: "5 т 36 м³", body: "VAN", frame: "грузовик", plate: "Т 318 ОК 00", trailerPlate: null, plateCountry: "RU", capacityKg: 5000, volumeM3: 36, lengthM: 6.2, widthM: 2.4, heightM: 2.4, pallets: 15 },
];

export type PersonDef = { id: string; name: string; kind: PersonKind; phone: string; canLogin: boolean; vehicleId: string | null };

export const PERSONS: PersonDef[] = [
  { id: "p-owner", name: "Виктор Северинов", kind: "OWNER", phone: "+7 900 000-11-01", canLogin: true, vehicleId: null },
  { id: "p-mgr1", name: "Ольга Ракитина", kind: "MANAGER", phone: "+7 900 000-11-02", canLogin: true, vehicleId: null },
  { id: "p-acc", name: "Нина Лозовская", kind: "ACCOUNTANT", phone: "+7 900 000-11-04", canLogin: true, vehicleId: null },
  { id: "p-cour1", name: "Денис Капустин", kind: "COURIER", phone: "+7 900 000-11-05", canLogin: true, vehicleId: null },
  { id: "p-cour2", name: "Артём Сидорчук", kind: "COURIER", phone: "+7 900 000-11-06", canLogin: false, vehicleId: null },
  { id: "p-drv1", name: "Геннадий Мартынов", kind: "DRIVER", phone: "+7 900 000-12-01", canLogin: false, vehicleId: "v1" },
  { id: "p-drv2", name: "Сергей Липатов", kind: "DRIVER", phone: "+7 900 000-12-02", canLogin: false, vehicleId: "v2" },
  { id: "p-drv3", name: "Юрий Белоусов", kind: "DRIVER", phone: "+7 900 000-12-04", canLogin: false, vehicleId: "v3" },
  { id: "p-drv4", name: "Николай Шестаков", kind: "DRIVER", phone: "+7 900 000-12-05", canLogin: false, vehicleId: "v4" },
  { id: "p-drv5", name: "Павел Дроздович", kind: "DRIVER", phone: "+375 29 000-12-03", canLogin: false, vehicleId: "v5" },
];

export type UserDef = { id: string; login: string; role: Role; personId: string };

export const USERS: UserDef[] = [
  { id: "u-owner", login: "owner", role: "OWNER", personId: "p-owner" },
  { id: "u-manager", login: "manager", role: "MANAGER", personId: "p-mgr1" },
  { id: "u-accountant", login: "accountant", role: "ACCOUNTANT", personId: "p-acc" },
  { id: "u-courier", login: "courier", role: "COURIER", personId: "p-cour1" },
];

export type ClientDef = {
  id: string;
  kind: ClientKind;
  name: string;
  residency: Country | null;
  taxId: string | null;
  kpp: string | null;
  bankName: string | null;
  account: string | null;
  director: string | null;
  contactPerson: string | null;
  address: string;
  phones: string[];
  email: string | null;
  /** откуда клиент обычно отправляет: из Москвы или из Беларуси */
  side: "RU" | "BY";
};

let byPhone = 20;
let ruPhone = 20;
function phoneBy() {
  byPhone += 1;
  return `+375 29 000-${String(30 + Math.floor(byPhone / 10)).padStart(2, "0")}-${String((byPhone * 7) % 100).padStart(2, "0")}`;
}
function phoneRu() {
  ruPhone += 1;
  return `+7 900 000-${String(40 + Math.floor(ruPhone / 10)).padStart(2, "0")}-${String((ruPhone * 13) % 100).padStart(2, "0")}`;
}

function person(id: string, name: string, country: Country, address: string, two = false): ClientDef {
  const ph = country === "BY" ? phoneBy : phoneRu;
  const phones = two ? [ph(), ph()] : [ph()];
  return { id, kind: "PERSON", name, residency: country, taxId: null, kpp: null, bankName: null, account: null, director: null, contactPerson: null, address, phones, email: null, side: country };
}

export const CLIENT_BANK_BIK = "044500000";

let accN = 100;
function company(id: string, name: string, country: Country, taxSeed: string, address: string, director: string, contact: string, email: string): ClientDef {
  accN += 37;
  const isBy = country === "BY";
  return {
    id,
    kind: "COMPANY",
    name,
    residency: country,
    taxId: isBy ? fakeUnp(taxSeed.slice(0, 8)) : fakeInn10(taxSeed.slice(0, 9)),
    kpp: isBy ? null : fakeKpp(taxSeed.slice(0, 4)),
    bankName: isBy ? "ОАО «Банк Липовая аллея»" : "АО «Банк Тихий омут»",
    account: isBy
      ? `BY00 ZZLA 3012 0000 ${String(accN).padStart(4, "0")} 0000 ${String(accN * 3).slice(-4).padStart(4, "0")}`
      : fakeRuAccount(CLIENT_BANK_BIK, "40702810", `000000${String(accN).padStart(5, "0")}`),
    director,
    contactPerson: contact,
    address,
    phones: [isBy ? phoneBy() : phoneRu()],
    email,
    side: country,
  };
}

export const CLIENTS: ClientDef[] = [
  // Москва и область: отправляют в Беларусь
  company("c01", "ООО «Дуб и Ясень»", "RU", "772813572", "г. Москва, ул. Столярная Горка, 6", "Ермолов Степан Аркадьевич", "Лидия, снабжение", "order@dub-yasen.example.com"),
  company("c02", "ООО «Плиточный двор»", "RU", "502960418", "г. Подольск, пр. Глиняный, 41", "Гайдуков Роман Олегович", "Роман", "sklad@plitka-dvor.example.com"),
  company("c03", "ООО «Синий Чайник»", "RU", "771088315", "г. Москва, ул. Фарфоровая, 2", "Матвеева Елена Викторовна", "Елена", "zakaz@siniy-chainik.example.com"),
  company("c04", "ООО «ТехноЛось»", "RU", "504710574", "г. Химки, ул. Лесная Просека, 18", "Козлов Игорь Петрович", "Игорь", "info@tekhnolos.example.com"),
  company("c05", "ООО «Шестерёнка и Ко»", "RU", "772415093", "г. Москва, ул. Подшипниковая Слобода, 27", "Тарасов Глеб Андреевич", "Глеб", "glebt@shesterenka.example.com"),
  company("c06", "ООО «Лампа и Кот»", "RU", "771955201", "г. Москва, ул. Абажурная, 9", "Пашкова Ирина Сергеевна", "Ирина", "hello@lampa-kot.example.com"),
  company("c07", "ООО «Тёплый Ломоть»", "RU", "771717730", "г. Москва, ул. Мучная Слобода, 3", "Шевцова Анна Павловна", "Анна", "pekarnya@lomot.example.com"),
  company("c08", "ООО «Кирпич и Глина»", "RU", "503218846", "г. Люберцы, ул. Песчаный Карьер, 12", "Хомутов Денис Ильич", "Денис", "sklad@kirpich-glina.example.com"),
  company("c09", "ООО «Северный Подшипник»", "RU", "502470915", "г. Мытищи, ул. Вагонная Слобода, 30", "Рябов Аркадий Семёнович", "Марина, логист", "logist@sev-podshipnik.example.com"),
  company("c10", "ООО «Холодный Склад»", "RU", "500321779", "г. Домодедово, ул. Ольховый Брод, 4", "Осипова Вера Андреевна", "Вера", "frost@holodny-sklad.example.com"),
  company("c11", "ООО «Пряничный Ряд»", "RU", "771622347", "г. Москва, ул. Пряничный Ряд, 30", "Кузьмин Олег Валерьевич", "Олег", "pryanik@ryad.example.com"),
  company("c12", "ООО «Станок и Стружка»", "RU", "503310268", "г. Красногорск, ул. Речной Откос, 8", "Ларионов Пётр Егорович", "Пётр", "info@stanok-struzhka.example.com"),
  person("c13", "Кравченко Анатолий Петрович", "RU", "г. Москва, ул. Яблоневый Сад, 12", true),
  person("c14", "Мельникова Оксана Викторовна", "RU", "г. Москва, ул. Ветряная Мельница, 33"),
  person("c15", "Савин Дмитрий Олегович", "RU", "г. Мытищи, ул. Озёрная Коса, 4"),
  person("c16", "Головачёва Татьяна Ивановна", "RU", "г. Москва, ул. Рябиновый Бульвар, 21"),
  // Беларусь: отправляют в Москву и получают из Москвы
  company("c17", "ООО «Северный Самовар»", "BY", "19133572", "г. Минск, ул. Чайная Слобода, 8", "Беляев Аркадий Николаевич", "Аркадий", "samovar@sever.example.com"),
  company("c18", "ООО «Кедровая Полка»", "BY", "19260418", "г. Минск, ул. Смолистая, 15", "Воронович Ксения Ильинична", "Ксения", "polka@kedr.example.com"),
  company("c19", "ИП Гусевич Тимофей Андреевич", "BY", "29088315", "г. Брест, ул. Буговой Плёс, 10", "Гусевич Тимофей Андреевич", "Тимофей", "gusevich.ta@example.com"),
  company("c20", "ЧУП «Медный Барсук»", "BY", "69210574", "г. Борисов, ул. Медная Горка, 4", "Ефимович Роман Петрович", "Роман", "barsuk@med.example.com"),
  company("c21", "ООО «Ледокол Снаб»", "BY", "19417730", "г. Минск, ул. Портовая Льдина, 2", "Орловский Вадим Сергеевич", "Вадим", "snab@ledokol.example.com"),
  company("c22", "ЧУП «Гродненский Сундук»", "BY", "59026613", "г. Гродно, ул. Кованая, 17", "Юркевич Павел Станиславович", "Павел", "sunduk@grodno.example.com"),
  company("c23", "ООО «Бобровый мост»", "BY", "19502846", "г. Минск, ул. Плотинная, 11", "Левкович Артур Геннадьевич", "Артур", "bobr@most.example.com"),
  company("c24", "ОДО «Сожская Пристань»", "BY", "40118827", "г. Гомель, ул. Сожская Излучина, 21", "Мартынюк Игорь Васильевич", "Игорь", "pristan@sozh.example.com"),
  company("c25", "ЧТУП «Двинский Короб»", "BY", "39204451", "г. Витебск, ул. Двинская Тропа, 5", "Жданович Елена Олеговна", "Елена", "korob@dvina.example.com"),
  company("c26", "ООО «Могилёвский Жернов»", "BY", "79136640", "г. Могилёв, ул. Днепровский Откос, 9", "Санько Олег Леонидович", "Олег", "zhernov@mog.example.com"),
  person("c27", "Никифорович Алёна Сергеевна", "BY", "г. Минск, ул. Каштановый Тупик, 6"),
  person("c28", "Соколовский Артём Вадимович", "BY", "г. Минск, ул. Звёздная Поляна, 23", true),
  person("c29", "Дорошевич Светлана Юрьевна", "BY", "г. Гродно, ул. Липовая Тень, 31"),
  person("c30", "Петренко Игорь Валентинович", "BY", "г. Брест, ул. Тихий Затон, 16"),
];

/** Сборные грузы. Палетные: вес и объём на одну палету. Штучные: габариты одного места, м. */
export type CargoDef = {
  name: string;
  /** какой кузов просит заявка */
  bodies: Body[];
  pallet?: { kg: [number, number]; m3: [number, number]; n: [number, number] };
  item?: { dims: [number, number, number][]; kg: [number, number]; n: [number, number] };
  /** способ загрузки: задняя или сверху и сбоку (только тент) */
  topSide?: number;
};

export const CARGO: CargoDef[] = [
  { name: "ТНП", bodies: ["TENT", "TENT", "CLOSED"], pallet: { kg: [180, 420], m3: [1.3, 1.7], n: [1, 7] } },
  { name: "Стройматериалы", bodies: ["TENT"], pallet: { kg: [600, 980], m3: [0.9, 1.3], n: [1, 4] }, topSide: 0.5 },
  { name: "Запчасти", bodies: ["TENT", "CLOSED"], pallet: { kg: [250, 600], m3: [0.8, 1.4], n: [1, 5] } },
  { name: "Продукты в коробах", bodies: ["REF", "REF", "CLOSED"], pallet: { kg: [350, 650], m3: [1.3, 1.7], n: [1, 6] } },
  {
    name: "Оборудование",
    bodies: ["TENT", "CLOSED"],
    item: { dims: [[1.2, 0.8, 1.4], [1.2, 1.0, 1.6], [2.0, 1.2, 1.8], [1.6, 0.8, 1.2]], kg: [150, 1400], n: [1, 2] },
    topSide: 0.6,
  },
];

/** Получатели-организации и люди для доставки в Москве */
export const RECIPIENTS: string[] = [
  "ООО «Тихая Гавань»", "ООО «Сосновый Бор»", "ИП Вешняков Р. А.", "ООО «Склад на Затоне»", "ООО «Северный двор»", "ООО «Кленовый лист»",
  "Беляков Сергей", "Тихонова Ольга", "Захаров Кирилл", "Аксёнова Нина", "Шилов Борис", "Сорокина Юлия", "Лаптев Глеб", "Голубева Дарья",
];

export const COMMENTS = ["Хрупкое, не кантовать", "Позвонить за час до приезда", "Въезд со двора, есть шлагбаум", "Упаковка в плёнку обязательна", "Пропуск на въезд заказывает получатель", "Растентовка сверху"];

export const CANCEL_REASONS = ["Клиент передумал", "Груз не готов к отправке", "Отправит в следующем месяце"];

export const LOAD_TIMES = ["9:00-17:00", "9:00-13:00", "10:00-16:00", "8:00-12:00", "14:00-18:00"];

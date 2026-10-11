// География: точки загрузки и выгрузки, расстояния, подсказки городов.
// Общая для сервера и браузера, без базы.

export type CountryCode = "RU" | "BY";

/** Точка загрузки или выгрузки: город, область, сколько км добавляет к направлению */
export type Place = { city: string; region: string; country: CountryCode; offset: number; streets: string[] };

/** Москва и область: откуда везём и куда привозим из Беларуси */
export const MOSCOW_PLACES: Place[] = [
  { city: "Москва", region: "Москва", country: "RU", offset: 0, streets: ["ул. Каменная Застава", "ул. Речная Слобода", "ул. Ивовая Пристань", "ул. Кузнечный Брод", "ул. Садовая Межа", "ул. Новый Затон", "ул. Бумажный Ряд", "ул. Глиняный Ряд"] },
  { city: "Химки", region: "Московская обл.", country: "RU", offset: 20, streets: ["ул. Лесная Просека", "ул. Аэродромная Межа"] },
  { city: "Подольск", region: "Московская обл.", country: "RU", offset: 40, streets: ["пр. Глиняный", "ул. Кирпичная Слобода"] },
  { city: "Домодедово", region: "Московская обл.", country: "RU", offset: 45, streets: ["ул. Взлётная Тропа", "ул. Ольховый Брод"] },
  { city: "Красногорск", region: "Московская обл.", country: "RU", offset: 20, streets: ["ул. Опалиховская Межа", "ул. Речной Откос"] },
  { city: "Люберцы", region: "Московская обл.", country: "RU", offset: 25, streets: ["ул. Песчаный Карьер", "ул. Тихая Заводь"] },
  { city: "Видное", region: "Московская обл.", country: "RU", offset: 30, streets: ["ул. Складская Пустошь", "ул. Берёзовая Роща"] },
  { city: "Мытищи", region: "Московская обл.", country: "RU", offset: 25, streets: ["ул. Озёрная Коса", "ул. Вагонная Слобода"] },
  { city: "Одинцово", region: "Московская обл.", country: "RU", offset: 10, streets: ["ул. Можайский Тракт", "ул. Сосновая Горка"] },
];

/** Беларусь: город направления и города рядом */
export const BY_PLACES: Record<string, Place[]> = {
  Минск: [
    { city: "Минск", region: "Минск", country: "BY", offset: 0, streets: ["ул. Хлебная Пристань", "ул. Тихий Затон", "пр. Ольховый", "ул. Медовая Слобода", "ул. Солнечный Брод", "ул. Кленовая Застава", "ул. Луговая Тропа", "ул. Песчаная Коса"] },
    { city: "Борисов", region: "Минская обл.", country: "BY", offset: -75, streets: ["ул. Березинский Брод", "ул. Медная Горка"] },
    { city: "Жодино", region: "Минская обл.", country: "BY", offset: -50, streets: ["ул. Карьерная Межа"] },
    { city: "Дзержинск", region: "Минская обл.", country: "BY", offset: 35, streets: ["ул. Лесная Опушка"] },
  ],
  Брест: [
    { city: "Брест", region: "Брестская обл.", country: "BY", offset: 0, streets: ["ул. Крепостная Тропа", "ул. Буговая Отмель", "ул. Каштановая Застава"] },
    { city: "Кобрин", region: "Брестская обл.", country: "BY", offset: -50, streets: ["ул. Канальная Тропа"] },
    { city: "Барановичи", region: "Брестская обл.", country: "BY", offset: -195, streets: ["ул. Вокзальная Слобода"] },
  ],
  Гомель: [
    { city: "Гомель", region: "Гомельская обл.", country: "BY", offset: 0, streets: ["ул. Сожская Излучина", "ул. Дворцовый Спуск"] },
    { city: "Речица", region: "Гомельская обл.", country: "BY", offset: 50, streets: ["ул. Днепровская Пристань"] },
  ],
  Витебск: [
    { city: "Витебск", region: "Витебская обл.", country: "BY", offset: 0, streets: ["ул. Двинская Тропа", "ул. Ратушная Горка"] },
    { city: "Орша", region: "Витебская обл.", country: "BY", offset: -30, streets: ["ул. Днепровский Вал"] },
  ],
  Гродно: [
    { city: "Гродно", region: "Гродненская обл.", country: "BY", offset: 0, streets: ["ул. Неманский Плёс", "ул. Замковая Горка"] },
    { city: "Лида", region: "Гродненская обл.", country: "BY", offset: -110, streets: ["ул. Замковая Тропа"] },
  ],
  Могилёв: [
    { city: "Могилёв", region: "Могилёвская обл.", country: "BY", offset: 0, streets: ["ул. Днепровский Откос", "ул. Ратушная Площадь"] },
    { city: "Бобруйск", region: "Могилёвская обл.", country: "BY", offset: 100, streets: ["ул. Березинская Коса"] },
  ],
};

/** Какому городу направления принадлежит место: «Борисов» → «Минск», «Химки» → «Москва» */
export function hubOf(city: string): string | null {
  if (MOSCOW_PLACES.some((p) => p.city === city)) return "Москва";
  for (const [hub, list] of Object.entries(BY_PLACES)) if (list.some((p) => p.city === city)) return hub;
  return null;
}

export function placeOf(city: string): Place | null {
  return MOSCOW_PLACES.find((p) => p.city === city) ?? Object.values(BY_PLACES).flat().find((p) => p.city === city) ?? null;
}

/** Расстояние заявки: километры направления плюс добавки мест загрузки и выгрузки */
export function distanceFor(routeKm: number, loadCity: string, unloadCity: string): number {
  return Math.max(1, routeKm + (placeOf(loadCity)?.offset ?? 0) + (placeOf(unloadCity)?.offset ?? 0));
}

// ---------- Подсказки городов ----------

/** Город для подсказки: население решает порядок, деревня с тем же именем никогда не выше города */
export type CityHint = { city: string; region: string; country: CountryCode; kind: "г." | "д." | "п." | "х." | "с."; pop: number };

/** Крупные города РФ и РБ (население округлённо), города наших направлений и одноимённые деревни */
export const CITY_HINTS: CityHint[] = [
  { city: "Москва", region: "Москва", country: "RU", kind: "г.", pop: 13000 },
  { city: "Санкт-Петербург", region: "Санкт-Петербург", country: "RU", kind: "г.", pop: 5600 },
  { city: "Минск", region: "Минск", country: "BY", kind: "г.", pop: 2000 },
  { city: "Новосибирск", region: "Новосибирская обл.", country: "RU", kind: "г.", pop: 1600 },
  { city: "Екатеринбург", region: "Свердловская обл.", country: "RU", kind: "г.", pop: 1500 },
  { city: "Казань", region: "Республика Татарстан", country: "RU", kind: "г.", pop: 1300 },
  { city: "Нижний Новгород", region: "Нижегородская обл.", country: "RU", kind: "г.", pop: 1200 },
  { city: "Смоленск", region: "Смоленская обл.", country: "RU", kind: "г.", pop: 310 },
  { city: "Брянск", region: "Брянская обл.", country: "RU", kind: "г.", pop: 370 },
  { city: "Гомель", region: "Гомельская обл.", country: "BY", kind: "г.", pop: 500 },
  { city: "Могилёв", region: "Могилёвская обл.", country: "BY", kind: "г.", pop: 355 },
  { city: "Витебск", region: "Витебская обл.", country: "BY", kind: "г.", pop: 360 },
  { city: "Гродно", region: "Гродненская обл.", country: "BY", kind: "г.", pop: 360 },
  { city: "Брест", region: "Брестская обл.", country: "BY", kind: "г.", pop: 340 },
  { city: "Бобруйск", region: "Могилёвская обл.", country: "BY", kind: "г.", pop: 210 },
  { city: "Барановичи", region: "Брестская обл.", country: "BY", kind: "г.", pop: 170 },
  { city: "Борисов", region: "Минская обл.", country: "BY", kind: "г.", pop: 140 },
  { city: "Орша", region: "Витебская обл.", country: "BY", kind: "г.", pop: 105 },
  { city: "Лида", region: "Гродненская обл.", country: "BY", kind: "г.", pop: 100 },
  { city: "Речица", region: "Гомельская обл.", country: "BY", kind: "г.", pop: 65 },
  { city: "Жодино", region: "Минская обл.", country: "BY", kind: "г.", pop: 65 },
  { city: "Кобрин", region: "Брестская обл.", country: "BY", kind: "г.", pop: 53 },
  { city: "Дзержинск", region: "Минская обл.", country: "BY", kind: "г.", pop: 31 },
  { city: "Химки", region: "Московская обл.", country: "RU", kind: "г.", pop: 260 },
  { city: "Подольск", region: "Московская обл.", country: "RU", kind: "г.", pop: 310 },
  { city: "Мытищи", region: "Московская обл.", country: "RU", kind: "г.", pop: 240 },
  { city: "Люберцы", region: "Московская обл.", country: "RU", kind: "г.", pop: 210 },
  { city: "Красногорск", region: "Московская обл.", country: "RU", kind: "г.", pop: 180 },
  { city: "Одинцово", region: "Московская обл.", country: "RU", kind: "г.", pop: 140 },
  { city: "Домодедово", region: "Московская обл.", country: "RU", kind: "г.", pop: 140 },
  { city: "Видное", region: "Московская обл.", country: "RU", kind: "г.", pop: 75 },
  // одноимённые деревни и посёлки: есть в справочнике, но всегда ниже городов
  { city: "Минск", region: "Красноярский край", country: "RU", kind: "д.", pop: 0.1 },
  { city: "Минский", region: "Кабардино-Балкарская Республика", country: "RU", kind: "х.", pop: 0.3 },
  { city: "Минское", region: "Калининградская обл.", country: "RU", kind: "п.", pop: 0.2 },
  { city: "Москва", region: "Кировская обл.", country: "RU", kind: "д.", pop: 0.1 },
  { city: "Москва", region: "Тверская обл.", country: "RU", kind: "д.", pop: 0.05 },
  { city: "Брест", region: "Новгородская обл.", country: "RU", kind: "д.", pop: 0.05 },
  { city: "Гомель", region: "Псковская обл.", country: "RU", kind: "д.", pop: 0.03 },
];

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim();

/**
 * Подсказки по началу слова. Порядок: точное совпадение с городом, потом города по населению,
 * деревни и посёлки только после всех городов. Первая строка (её берёт Enter) всегда город.
 */
export function suggestCities(q: string, limit = 8): CityHint[] {
  const n = norm(q);
  if (!n) return CITY_HINTS.filter((h) => h.kind === "г.").slice(0, limit);
  const hits = CITY_HINTS.filter((h) => norm(h.city).startsWith(n) || norm(h.region).startsWith(n));
  const town = (h: CityHint) => (h.kind === "г." ? 0 : 1);
  const exact = (h: CityHint) => (norm(h.city) === n ? 0 : 1);
  return hits.sort((a, b) => town(a) - town(b) || exact(a) - exact(b) || b.pop - a.pop || a.city.localeCompare(b.city)).slice(0, limit);
}

export function hintLabel(h: CityHint): string {
  return h.kind === "г." ? h.city : `${h.city} ${h.kind}`;
}

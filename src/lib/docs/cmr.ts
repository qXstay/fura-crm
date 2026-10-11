import "server-only";
import { count, fmtFixed, fmtNum } from "../money";
import { wrap } from "./measure";
import { orderLabel } from "../numbering";
import { fmtDayNum, fromDbDate } from "../time";
import { Page } from "./builder";
import { COUNTRY_EN, COUNTRY_NAME, sideOf, type TripDoc } from "./data";
import { A4, type Source } from "./types";

const L = 10;
const R = 200;
const MID = 105;
const LABEL = 5.6;
const LABEL_EN = 5.2;
const VAL = 7.6;
const GRAY = "#555c57";

/** Графа бланка: рамка, номер, подпись по-русски и по-английски. Возвращает y начала значения. */
function graph(p: Page, n: number | null, x: number, y: number, w: number, h: number, ru: string, en: string) {
  p.rect(x, y, w, h, { stroke: 0.3 });
  let tx = x + 1.2;
  if (n != null) {
    p.rect(x + 1, y + 1, 4.2, 3.6, { stroke: 0.3 });
    p.text(x + 1, y + 1.35, 4.2, String(n), { size: 6.2, weight: 700, align: "center" });
    tx = x + 6.4;
  }
  const h1 = p.text(tx, y + 1, w - (tx - x) - 1, ru, { size: LABEL, weight: 600, lh: 2.35 });
  const h2 = p.text(tx, y + 1 + h1, w - (tx - x) - 1, en, { size: LABEL_EN, color: GRAY, lh: 2.2 });
  return y + 1.6 + h1 + h2;
}

/** Род упаковки сводно: палеты, места без палет */
export function packingOf(orders: { pallets: number; dims: string | null }[]): string {
  const kinds: string[] = [];
  if (orders.some((o) => o.pallets > 0)) kinds.push("палеты");
  if (orders.some((o) => !o.pallets && o.dims)) kinds.push("места в плёнке и обрешётке");
  return kinds.join(", ");
}

/** Подписи экземпляров: обычно три, отправителю, получателю и перевозчику */
export const CMR_COPIES = [
  "Экземпляр 1. Для отправителя / Copy 1 for sender",
  "Экземпляр 2. Для получателя / Copy 2 for consignee",
  "Экземпляр 3. Для перевозчика / Copy 3 for carrier",
  "Экземпляр 4. Дополнительный / Copy 4",
];

export function buildCmr(t: TripDoc, missingKeys: Set<string>, copy = 1): Page {
  const p = new Page(A4.w, A4.h, "cmr", "CMR", `рейс № ${t.number}`);
  const sender = sideOf(t.company, t.route.fromCountry);
  const receiver = sideOf(t.company, t.route.toCountry);
  const company = t.company;
  const sideText = (x: ReturnType<typeof sideOf>) => [x.name, x.address, x.tax, x.bank].filter(Boolean).join("\n") + `\n${COUNTRY_NAME[x.country]} / ${COUNTRY_EN[x.country]}`;
  const depart = fromDbDate(t.departDate);
  const orders = t.orders;
  const places = orders.reduce((s, o) => s + o.places, 0);
  const weight = orders.reduce((s, o) => s + o.weightKg, 0);
  const volume = orders.reduce((s, o) => s + o.volumeM3, 0);

  const val = (x: number, y: number, w: number, text: string, key?: string, o: { size?: number; max?: number; weight?: 400 | 600; fit?: boolean } = {}) => {
    let size = o.size ?? VAL;
    // реквизиты сторон печатаются целиком: если не влезают в графу, шрифт чуть мельче, а не обрезка
    if (o.fit && o.max) while (size > 6.4 && wrap(text, w, size, o.weight ?? 400).length > o.max) size -= 0.2;
    return p.text(x, y, w, text, { size, weight: o.weight ?? 400, lh: size * 0.3528 * 1.28, max: o.fit && o.max ? Math.max(o.max, wrap(text, w, size, o.weight ?? 400).length) : o.max, key, value: true });
  };
  const field = (id: string, graphNo: number | undefined, x: number, y: number, w: number, h: number, title: string, source?: Source, sourceLabel?: string, missing?: boolean) =>
    p.field({ id, graph: graphNo, x, y, w, h, title, source, sourceLabel, missing });

  p.text(L, 4.6, 130, CMR_COPIES[Math.min(copy, CMR_COPIES.length) - 1], { size: 7, weight: 600, key: "copy", value: true });
  p.text(R - 60, 5.2, 60, "Образец по форме для печати", { size: 6, color: GRAY, align: "right" });

  // 1 Отправитель
  let y0 = 10;
  let vy = graph(p, 1, L, y0, MID - L, 32, "Отправитель (наименование, адрес, страна)", "Sender (name, address, country)");
  val(L + 2, vy, MID - L - 4, sideText(sender), `party:${sender.key}`, { max: 7, fit: true });
  field("g1", 1, L, y0, MID - L, 32, "Графа 1. Отправитель", "entity", sender.country === "RU" ? "Компания и её склад в России из настроек: наименование, адрес склада, ИНН и КПП, банк" : "Представительство и склад в Беларуси из настроек: наименование, адрес склада, УНП", missingKeys.has("company:fullName") || missingKeys.has("company:taxId"));

  // Заголовок CMR
  p.rect(MID, y0, R - MID, 32, { stroke: 0.3 });
  p.text(MID + 3, y0 + 3, 62, "МЕЖДУНАРОДНАЯ ТОВАРНО-ТРАНСПОРТНАЯ НАКЛАДНАЯ", { size: 7.2, weight: 700, lh: 3 });
  p.text(MID + 3, y0 + 10, 62, "INTERNATIONAL CONSIGNMENT NOTE", { size: 6.4, color: GRAY, lh: 2.7 });
  p.text(MID + 66, y0 + 2.4, 27, "CMR", { size: 24, weight: 700, align: "right" });
  p.text(MID + 3, y0 + 26, 40, "№", { size: 7, color: GRAY });
  val(MID + 8, y0 + 25.6, 50, `${t.number}-2`, "trip-no", { size: 9, weight: 600 });
  field("gno", undefined, MID, y0, R - MID, 32, "Номер накладной", "trip", "Номер рейса и номер документа рейса: 1 складской список, 2 CMR");

  // 2 Получатель / 16 Перевозчик
  y0 = 42;
  vy = graph(p, 2, L, y0, MID - L, 30, "Получатель (наименование, адрес, страна)", "Consignee (name, address, country)");
  val(L + 2, vy, MID - L - 4, sideText(receiver), `party:${receiver.key}`, { max: 6, fit: true });
  field("g2", 2, L, y0, MID - L, 30, "Графа 2. Получатель", "receiver", receiver.country === "BY" ? "Представительство и склад в Беларуси из настроек: груз приходит на свой склад, дальше выдача получателям по складскому списку" : "Компания и её склад в России из настроек: груз приходит на свой склад");

  vy = graph(p, 16, MID, y0, R - MID, 30, "Перевозчик (наименование, адрес, страна)", "Carrier (name, address, country)");
  val(MID + 2, vy, R - MID - 4, `${company.fullName}\n${company.address}\nИНН ${company.taxId}`, "carrier", { max: 4 });
  if (t.driver) val(MID + 2, y0 + 25.4, R - MID - 4, `Водитель: ${t.driver.name}`, "driver", { size: VAL, weight: 600 });
  field("g16", 16, MID, y0, R - MID, 30, "Графа 16. Перевозчик и водитель", "driver", `Перевозчик: компания из настроек, водитель из карточки рейса${t.driver ? `: ${t.driver.name}` : ""}`, missingKeys.has("driver"));

  // 3 Место разгрузки / 17 Последующий перевозчик
  y0 = 72;
  vy = graph(p, 3, L, y0, MID - L, 14, "Место разгрузки груза (место, страна)", "Place of delivery of the goods (place, country)");
  // свой склад в стране назначения
  val(L + 2, vy, MID - L - 4, receiver.address.replace(/^\d{6},\s*/, ""), `place:${receiver.key}`, { max: 2, fit: true });
  field("g3", 3, L, y0, MID - L, 14, "Графа 3. Место разгрузки", "route", `Свой склад в стране назначения рейса ${t.route.fromCity} → ${t.route.toCity}`);
  graph(p, 17, MID, y0, R - MID, 14, "Последующий перевозчик (наименование, адрес, страна)", "Successive carriers (name, address, country)");

  // 4 Место и дата погрузки / 18 Оговорки
  y0 = 86;
  vy = graph(p, 4, L, y0, MID - L, 16, "Место и дата погрузки груза (место, страна, дата)", "Place and date of taking over the goods (place, country, date)");
  val(L + 2, vy, MID - L - 30, `${sender.address.replace(/^\d{6},\s*/, "").replace(/, (Российская Федерация|Республика Беларусь)/, "")}, ${COUNTRY_NAME[t.route.fromCountry]}`, `place:${sender.key}`, { max: 2, size: 6.6 });
  if (depart) val(MID - 27, vy, 25, fmtDayNum(depart), "depart", { weight: 600 });
  field("g4", 4, L, y0, MID - L, 16, "Графа 4. Место и дата погрузки", "route", "Свой склад в стране отправления, дата из даты выезда рейса", missingKeys.has("departDate"));
  graph(p, 18, MID, y0, R - MID, 32, "Оговорки и замечания перевозчика", "Carrier's reservations and observations");

  // 5 Прилагаемые документы
  y0 = 102;
  vy = graph(p, 5, L, y0, MID - L, 16, "Прилагаемые документы", "Documents attached");
  const nums = orders.map((o) => orderLabel(o.seq));
  // Никогда не обрезаем: полный список, если влезает, иначе ссылка на складской список
  const full = `Складской список № ${t.number}-1. Договоры-заявки № ${nums.join(", ")}`;
  const short = `Складской список № ${t.number}-1 и ${count(nums.length, "contract")} к нему, номера по порядку погрузки в списке`;
  const docsText = !nums.length ? "" : wrap(full, MID - L - 4, 6.6, 400).length <= 3 ? full : short;
  val(L + 2, vy, MID - L - 4, docsText, "docs", { size: 6.6 });
  field("g5", 5, L, y0, MID - L, 16, "Графа 5. Прилагаемые документы", "orders", "Складской список и договоры-заявки рейса по порядку погрузки");

  // 6-12 Груз
  y0 = 118;
  const cols = [
    { n: 6, x: L, w: 22, ru: "Знаки и номера", en: "Marks and Nos" },
    { n: 7, x: L + 22, w: 21, ru: "Количество мест", en: "Number of packages" },
    { n: 8, x: L + 43, w: 23, ru: "Род упаковки", en: "Method of packing" },
    { n: 9, x: L + 66, w: 50, ru: "Наименование груза", en: "Nature of the goods" },
    { n: 10, x: L + 116, w: 26, ru: "Статистический номер", en: "Statistical number" },
    { n: 11, x: L + 142, w: 24, ru: "Вес брутто, кг", en: "Gross weight in kg" },
    { n: 12, x: L + 166, w: 24, ru: "Объём, м³", en: "Volume in m³" },
  ];
  const bodyY = y0 + 13;
  const bodyH = 34;
  for (const c of cols) {
    graph(p, c.n, c.x, y0, c.w, 13, c.ru, c.en);
    p.rect(c.x, bodyY, c.w, bodyH, { stroke: 0.3 });
  }
  if (orders.length) {
    val(cols[0].x + 2, bodyY + 3, cols[0].w - 4, "номер заявки на каждом месте", "marks", { size: 6.6 });
    val(cols[1].x + 2, bodyY + 3, cols[1].w - 4, fmtNum(places, 0), "places", { size: 9, weight: 600 });
    val(cols[2].x + 2, bodyY + 3, cols[2].w - 4, packingOf(orders), "packing", { size: 6.6 });
    val(cols[3].x + 2, bodyY + 3, cols[3].w - 4, "Сборный груз", "nature", { size: 9, weight: 600 });
    val(cols[3].x + 2, bodyY + 8, cols[3].w - 4, `по ${orders.length} договорам-заявкам, см. графу 5`, "nature-sub", { size: 6.6 });
    val(cols[5].x + 2, bodyY + 3, cols[5].w - 4, fmtFixed(weight, 1), "weight", { size: 9, weight: 600 });
    val(cols[6].x + 2, bodyY + 3, cols[6].w - 4, fmtNum(volume, 2), "volume", { size: 9, weight: 600 });
  }
  field("g6", 6, cols[0].x, y0, cols[0].w, 13 + bodyH, "Графа 6. Знаки и номера", "orders", "Каждое место маркируется номером своей заявки");
  field("g8", 8, cols[2].x, y0, cols[2].w, 13 + bodyH, "Графа 8. Род упаковки", "orders", "Сводно по грузам заявок рейса");
  field("g7", 7, cols[1].x, y0, cols[1].w, 13 + bodyH, "Графа 7. Количество мест", "orders", "Сумма мест всех заявок рейса");
  field("g9", 9, cols[3].x, y0, cols[3].w, 13 + bodyH, "Графа 9. Наименование груза", "orders", "«Сборный груз»: в рейсе едут грузы разных клиентов");
  field("g11", 11, cols[5].x, y0, cols[5].w, 13 + bodyH, "Графа 11. Вес брутто", "orders", "Сумма веса заявок рейса");
  field("g12", 12, cols[6].x, y0, cols[6].w, 13 + bodyH, "Графа 12. Объём", "orders", "Сумма объёма заявок рейса");
  // ДОПОГ
  const adrY = bodyY + bodyH;
  p.rect(L, adrY, R - L, 6, { stroke: 0.3 });
  const adr = ["Класс / Class", "Цифра / Number", "Буква / Letter", "(ДОПОГ / ADR)"];
  adr.forEach((a, i) => {
    const x = L + 50 + i * 35;
    p.text(x, adrY + 1.6, 34, a, { size: 5.6, color: GRAY });
    if (i > 0) p.line(x - 2, adrY, x - 2, adrY + 6, 0.2);
  });

  // 13 Указания отправителя / 19 Особые согласования
  y0 = adrY + 6;
  graph(p, 13, L, y0, MID - L, 24, "Указания отправителя (таможенная и прочая обработка)", "Sender's instructions (customs and other formalities)");
  graph(p, 19, MID, y0, R - MID, 16, "Особые согласования", "Special agreements");

  // 14 Указания об оплате / 20 Подлежит оплате
  y0 += 24;
  graph(p, 14, L, y0, MID - L, 16, "Указания об оплате провозной платы", "Instructions as to payment for carriage");
  p.text(L + 8, y0 + 10.5, 40, "Франко / Carriage paid", { size: 5.8, color: GRAY });
  p.text(L + 52, y0 + 10.5, 45, "Не франко / Carriage forward", { size: 5.8, color: GRAY });
  p.rect(L + 3, y0 + 10.2, 3.2, 3.2, { stroke: 0.3 });
  p.rect(L + 47, y0 + 10.2, 3.2, 3.2, { stroke: 0.3 });
  // провоз оплачивают клиенты при приёме заявки: франко
  val(L + 3.5, y0 + 9.9, 4, "X", "g14", { weight: 600 });
  field("g14", 14, L, y0, MID - L, 16, "Графа 14. Оплата провоза", "orders", "Провоз оплачивают клиенты по заявкам: франко");

  const t20y = y0 - 8;
  graph(p, 20, MID, t20y, R - MID, 40, "Подлежит оплате", "To be paid by");
  const rowsY = t20y + 8.6;
  const head = ["", "Отправитель", "Валюта", "Получатель"];
  const cw = [28, 24, 17, 26];
  let cx = MID;
  head.forEach((h, i) => {
    p.text(cx + 1, rowsY + 0.6, cw[i] - 2, h, { size: 4.8, color: GRAY, max: 1 });
    cx += cw[i];
  });
  const rows = ["Провозная плата", "Скидки", "Разница", "Надбавки", "Доп. сборы", "Прочие", "Итого"];
  rows.forEach((r, i) => {
    const ry = rowsY + 3.6 + i * 4;
    p.line(MID, ry, R, ry, 0.15);
    p.text(MID + 1, ry + 0.9, cw[0] - 2, r, { size: 5.4, weight: i === 6 ? 600 : 400 });
  });
  let lx = MID + cw[0];
  for (let i = 1; i < cw.length; i++) {
    p.line(lx, rowsY, lx, t20y + 40, 0.15);
    lx += cw[i];
  }

  // 15 Наложенный платёж
  y0 += 16;
  vy = graph(p, 15, L, y0, MID - L, 16, "Возврат наложенного платежа", "Cash on delivery");
  val(L + 2, vy, MID - L - 4, "нет", "g15", { size: 6.8 });
  field("g15", 15, L, y0, MID - L, 16, "Графа 15. Наложенный платёж", "orders", "Сборный груз без наложенного платежа");

  // 21 Составлена
  y0 += 16;
  vy = graph(p, 21, L, y0, 62, 10, "Составлена в", "Established in");
  graph(p, null, L + 62, y0, R - L - 62, 10, "Дата составления", "Date");
  val(L + 30, y0 + 2.4, 30, /г\. [^,]+/.exec(sender.address)?.[0] ?? "", "g21-place", { weight: 600 });
  if (depart) val(L + 92, y0 + 2.4, 60, fmtDayNum(depart), "g21-date", { weight: 600 });
  field("g21", 21, L, y0, R - L, 10, "Графа 21. Составлена в", "route", "Город своего склада отправления и дата выезда рейса", missingKeys.has("departDate"));

  // 22, 23, 24
  y0 += 10;
  const w3 = (R - L) / 3;
  graph(p, 22, L, y0, w3, 28, "Подпись и штамп отправителя", "Signature and stamp of the sender");
  graph(p, 23, L + w3, y0, w3, 28, "Подпись и штамп перевозчика", "Signature and stamp of the carrier");
  graph(p, 24, L + 2 * w3, y0, w3, 28, "Груз получен. Место ___________", "Goods received. Place");
  p.text(L + 2 * w3 + 2, y0 + 15, w3 - 4, "«____» ____________ 20___ г.", { size: 6 });
  p.text(L + 2 * w3 + 2, y0 + 21, w3 - 4, "Подпись и штамп получателя / Signature and stamp of the consignee", { size: 5.2, color: GRAY, lh: 2.2 });

  // 25-29
  y0 += 28;
  const last = [
    { n: 25, w: 50, ru: "Регистрационный номер", en: "Registration number" },
    { n: 26, w: 46, ru: "Марка", en: "Make" },
    { n: 27, w: 40, ru: "Расчёт стоимости", en: "Calculation of charges" },
    { n: 28, w: 24, ru: "Пломбы", en: "Seals" },
    { n: 29, w: 30, ru: "Отметки о сдаче груза", en: "Delivery notes" },
  ];
  let bx = L;
  for (const b of last) {
    const vy2 = graph(p, b.n, bx, y0, b.w, 16, b.ru, b.en);
    if (b.n === 25 && t.vehicle?.plate) val(bx + 2, vy2, b.w - 4, `${t.vehicle.plate}${t.vehicle.trailerPlate ? ` / ${t.vehicle.trailerPlate}` : ""}`, "plate", { weight: 600 });
    if (b.n === 26 && t.vehicle) val(bx + 2, vy2, b.w - 4, t.vehicle.brand, "brand", { weight: 600 });
    if (b.n === 25) field("g25", 25, bx, y0, b.w, 16, "Графа 25. Госномер", "vehicle", "Тягач и прицеп из карточки машины водителя", missingKeys.has("plate"));
    if (b.n === 26) field("g26", 26, bx, y0, b.w, 16, "Графа 26. Марка", "vehicle", "Марка из карточки машины");
    bx += b.w;
  }
  p.text(L, y0 + 18.4, R - L, "Графы, которые не заполняет программа, заполняются от руки, как обычно.", { size: 5.6, color: GRAY });
  return p;
}

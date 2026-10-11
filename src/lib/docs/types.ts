// Модель листа: всё в миллиметрах. Её рисуют и HTML-превью, и PDF.

export type Weight = 400 | 600 | 700;
export type Source = "entity" | "receiver" | "route" | "trip" | "driver" | "vehicle" | "orders" | "client" | "order";

export type TextEl = {
  t: "text";
  x: number;
  y: number;
  w: number;
  lines: string[];
  size: number;
  weight: Weight;
  align: "left" | "center" | "right";
  lh: number;
  color?: string;
  /** ключ для плавной анимации между листами (обратный рейс) */
  key?: string;
  /** заполненное значение, а не надпись бланка */
  value?: boolean;
};

export type RectEl = { t: "rect"; x: number; y: number; w: number; h: number; stroke?: number; fill?: string; dash?: boolean; color?: string };
export type LineEl = { t: "line"; x1: number; y1: number; x2: number; y2: number; width: number; dash?: boolean; color?: string };

/** Графа бланка: область, откуда берётся значение */
export type FieldEl = {
  t: "field";
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  graph?: number;
  title: string;
  source?: Source;
  sourceLabel?: string;
  missing?: boolean;
};

export type DocEl = TextEl | RectEl | LineEl | FieldEl;

export type DocKind = "warehouse" | "cmr" | "contract" | "act" | "invoice";

export type DocPage = { w: number; h: number; kind: DocKind; els: DocEl[]; title: string; ref?: string };

export type Missing = { key: string; label: string; input: "date" | "text" | "driver"; hint: string; entityId?: string; value?: string };

export type DocInfo = {
  key: DocKind;
  title: string;
  sub: string;
  pages: number[];
  ready: boolean;
  missing: Missing[];
  /** в рейсе нет заявок: лист есть, но печатать нечего */
  empty?: boolean;
  /** листы всех экземпляров для печати (CMR), первый совпадает с превью */
  copies?: number[];
};

export type DocPack = { docs: DocInfo[]; pages: DocPage[]; tripId: string; tripNo: number; drivers?: { id: string; name: string }[] };

export const A4 = { w: 210, h: 297 };
export const A4L = { w: 297, h: 210 };
export const PT_MM = 25.4 / 72;
/** Верх строки до базовой линии, в долях кегля (Onest: 970/1000 при высоте 1275) */
export const ASC = 0.97;
export const LINE_CONTENT = 1.275;

export const SOURCE_COLOR: Record<Source, string> = {
  entity: "#2b5c9a",
  receiver: "#7b4b2a",
  route: "#0b6b3f",
  trip: "#0b6b3f",
  driver: "#c26a00",
  vehicle: "#0e6a6a",
  orders: "#7a3f8a",
  client: "#2b5c9a",
  order: "#7a3f8a",
};

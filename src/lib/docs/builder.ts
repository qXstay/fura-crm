import "server-only";
import { wrap } from "./measure";
import type { DocEl, DocKind, DocPage, FieldEl, Source, TextEl, Weight } from "./types";

/** Помощник для разметки листа */
export class Page {
  els: DocEl[] = [];
  constructor(
    public w: number,
    public h: number,
    public kind: DocKind,
    public title: string,
    public ref?: string,
  ) {}

  text(
    x: number,
    y: number,
    w: number,
    text: string,
    o: { size?: number; weight?: Weight; align?: TextEl["align"]; lh?: number; max?: number; color?: string; key?: string; value?: boolean } = {},
  ): number {
    const size = o.size ?? 8;
    const weight = o.weight ?? 400;
    const lh = o.lh ?? size * 0.3528 * 1.32;
    const lines = text ? wrap(text, w, size, weight, o.max) : [];
    if (lines.length) this.els.push({ t: "text", x, y, w, lines, size, weight, align: o.align ?? "left", lh, color: o.color, key: o.key, value: o.value });
    return lines.length * lh;
  }

  rect(x: number, y: number, w: number, h: number, o: { stroke?: number; fill?: string; dash?: boolean; color?: string } = {}) {
    this.els.push({ t: "rect", x, y, w, h, stroke: o.stroke ?? 0.25, fill: o.fill, dash: o.dash, color: o.color });
  }

  line(x1: number, y1: number, x2: number, y2: number, width = 0.25, dash = false, color?: string) {
    this.els.push({ t: "line", x1, y1, x2, y2, width, dash, color });
  }

  field(f: Omit<FieldEl, "t">) {
    this.els.push({ t: "field", ...f });
  }

  done(): DocPage {
    return { w: this.w, h: this.h, kind: this.kind, els: this.els, title: this.title, ref: this.ref };
  }
}

export type { Source };

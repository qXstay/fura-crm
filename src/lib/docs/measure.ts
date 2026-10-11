import "server-only";
import fs from "node:fs";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import type { Weight } from "./types";
import { PT_MM } from "./types";

type FK = ReturnType<typeof fontkit.create>;

const cache = new Map<Weight, { font: FK; bytes: Uint8Array; widths: Map<number, number> }>();

export function fontDir() {
  return path.join(process.cwd(), "assets", "fonts");
}

export function docFont(weight: Weight) {
  let f = cache.get(weight);
  if (!f) {
    const bytes = fs.readFileSync(path.join(fontDir(), `doc-${weight}.ttf`));
    f = { font: fontkit.create(bytes), bytes, widths: new Map() };
    cache.set(weight, f);
  }
  return f;
}

/** Ширина строки в мм при кегле size (pt). Без кернинга: так же считает браузер с отключённым кернингом. */
export function textWidth(text: string, size: number, weight: Weight): number {
  const f = docFont(weight);
  let units = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let w = f.widths.get(cp);
    if (w === undefined) {
      w = f.font.glyphForCodePoint(cp).advanceWidth;
      f.widths.set(cp, w);
    }
    units += w;
  }
  return (units / f.font.unitsPerEm) * size * PT_MM;
}

/** Перенос по словам в ширину w мм. Длинные слова режутся. Лишнее заканчивается многоточием. */
/** Склейки, которые нельзя рвать переносом: телефоны, госномера, «№ 171», «г. Минск» */
export function keepTogether(text: string): string {
  const nb = (m: string) => m.replace(/ /g, "\u00a0");
  return text
    .replace(/\+\d{1,3} \d{2,3} \d{3}-\d{2}-\d{2}/g, nb)
    .replace(/(^|[\s(])([А-ЯA-Z] \d{3} [А-ЯA-Z]{2} \d{2,3})/g, (_, a: string, b: string) => a + nb(b))
    .replace(/(^|[\s(])([А-ЯA-Z]{2} \d{4} \d{2,3})/g, (_, a: string, b: string) => a + nb(b))
    .replace(/№ /g, "№\u00a0")
    .replace(/(^|[\s(,])(ИНН|КПП|УНП|БИК|BIC|р\/с) (?=[\dA-Z])/g, "$1$2\u00a0")
    .replace(/(^|[\s(,])(г|ул|пр|д|стр)\. /g, (_, a: string, b: string) => `${a}${b}.\u00a0`);
}

/** Только символы, которые есть в шрифте бланков: эмодзи и редкие знаки не превращаются в пустые квадраты */
const glyphKnown = new Map<number, boolean>();
export function printable(text: string, weight: Weight = 400): string {
  // кириллица, латиница, цифры и знаки препинания есть всегда: быстрый путь без разбора
  if (/^[\n\u0020-\u007e\u00a0-\u00bb\u0401-\u0451\u2013-\u2026\u2116\u2192\u20bd]*$/.test(text)) return text;
  const f = docFont(weight);
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let ok = glyphKnown.get(cp);
    if (ok === undefined) glyphKnown.set(cp, (ok = cp === 10 || cp === 0xa0 || f.font.hasGlyphForCodePoint(cp)));
    if (ok) out += ch;
  }
  return out.replace(/[ \t]{2,}/g, " ");
}

export function wrap(text: string, w: number, size: number, weight: Weight, maxLines = 99): string[] {
  const out: string[] = [];
  for (const para of keepTogether(printable(String(text ?? ""), weight)).replace(/\u202f/g, "\u00a0").split("\n")) {
    const words = para.split(/[ \t]+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const cand = line ? `${line} ${word}` : word;
      if (textWidth(cand, size, weight) <= w) {
        line = cand;
        continue;
      }
      if (line) out.push(line);
      if (textWidth(word, size, weight) <= w) {
        line = word;
      } else {
        let chunk = "";
        for (const ch of word) {
          if (textWidth(chunk + ch, size, weight) > w && chunk) {
            out.push(chunk);
            chunk = ch;
          } else chunk += ch;
        }
        line = chunk;
      }
    }
    out.push(line);
  }
  while (out.length > 1 && out[out.length - 1] === "") out.pop();
  if (out.length > maxLines) {
    const cut = out.slice(0, maxLines);
    let last = cut[maxLines - 1];
    while (last && textWidth(last + "…", size, weight) > w) last = last.slice(0, -1);
    cut[maxLines - 1] = last.trimEnd() + "…";
    return cut;
  }
  return out;
}

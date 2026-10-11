import "server-only";
import fontkit from "@pdf-lib/fontkit";
import { LineCapStyle, PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { docFont } from "./measure";
import { ASC, LINE_CONTENT, PT_MM, type DocPage, type Weight } from "./types";

const MM = 72 / 25.4;

function hex(c: string | undefined, fallback = "#141a16") {
  const h = (c ?? fallback).replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

/** PDF без браузера: те же координаты, те же шрифты, что и в превью */
export async function renderPdf(pages: DocPage[], meta: { title: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(meta.title);
  doc.setProducer("Фура");
  doc.setCreator("Фура");
  const fonts = new Map<Weight, PDFFont>();
  const font = async (w: Weight) => {
    let f = fonts.get(w);
    if (!f) {
      f = await doc.embedFont(docFont(w).bytes, { subset: true });
      fonts.set(w, f);
    }
    return f;
  };
  for (const pg of pages) {
    const page = doc.addPage([pg.w * MM, pg.h * MM]);
    const H = pg.h;
    for (const el of pg.els) {
      if (el.t === "rect") {
        page.drawRectangle({
          x: el.x * MM,
          y: (H - el.y - el.h) * MM,
          width: el.w * MM,
          height: el.h * MM,
          color: el.fill ? hex(el.fill) : undefined,
          borderColor: el.stroke ? hex(el.color, "#1d2420") : undefined,
          borderWidth: el.stroke ? el.stroke * MM : 0,
          borderDashArray: el.dash ? [3, 2] : undefined,
        });
      } else if (el.t === "line") {
        page.drawLine({
          start: { x: el.x1 * MM, y: (H - el.y1) * MM },
          end: { x: el.x2 * MM, y: (H - el.y2) * MM },
          thickness: el.width * MM,
          color: hex(el.color, "#1d2420"),
          dashArray: el.dash ? [4, 3] : undefined,
          lineCap: LineCapStyle.Butt,
        });
      } else if (el.t === "text") {
        const f = await font(el.weight);
        const sizeMm = el.size * PT_MM;
        el.lines.forEach((line, i) => {
          const top = el.y + i * el.lh;
          const baseline = top + (el.lh - LINE_CONTENT * sizeMm) / 2 + ASC * sizeMm;
          const w = f.widthOfTextAtSize(line, el.size) / MM;
          const x = el.align === "right" ? el.x + el.w - w : el.align === "center" ? el.x + (el.w - w) / 2 : el.x;
          page.drawText(line, { x: x * MM, y: (H - baseline) * MM, size: el.size, font: f, color: hex(el.color, "#141a16") });
        });
      }
    }
  }
  return doc.save({ useObjectStreams: true });
}

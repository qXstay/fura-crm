"use client";

import { PALLET_L, PALLET_W, palletPlaces } from "@/lib/freight";
import type { SOrder, SVehicle } from "@/lib/snapshot";

/** Приглушённые цвета заявок: тон меняется, насыщенность низкая, светлота своя у каждой темы */
const HUES = [165, 30, 210, 280, 350, 95, 190, 45, 240, 320, 130, 10];

export function colorOf(i: number) {
  return `hsl(${HUES[i % HUES.length]} var(--tile-s) var(--tile-l))`;
}

/**
 * Палетоместа сверху, в масштабе кузова: прямоугольник длиной и шириной кузова,
 * клетки 1,2 × 0,8 м по три поперёк. Груз встаёт от передней стенки в порядке погрузки.
 */
export function PalletPlan({ v, orders, hover, onHover }: { v: SVehicle; orders: SOrder[]; hover?: string | null; onHover?: (id: string | null) => void }) {
  const across = Math.floor(v.widthM / PALLET_W + 1e-6);
  const rows = Math.floor(v.lengthM / PALLET_L + 1e-6);
  const cap = Math.min(v.pallets, across * rows);
  const cells: { id: string | null; color: string | null }[] = Array.from({ length: cap }, () => ({ id: null, color: null }));
  let k = 0;
  orders.forEach((o, i) => {
    const n = palletPlaces(o);
    for (let j = 0; j < n && k < cap; j++, k++) cells[k] = { id: o.id, color: colorOf(i) };
  });
  // масштаб: 1 м = 40 условных единиц
  const S = 40;
  const W = v.lengthM * S;
  const H = v.widthM * S;
  const pad = 0.04 * S;
  const cw = PALLET_L * S;
  const ch = PALLET_W * S;
  const y0 = (H - across * ch) / 2;
  return (
    <figure className="m-0" data-testid="pallet-plan">
      {/* схема всегда целиком по ширине; на узком экране клетки мельче, а номера крупнее в единицах схемы (.pallet-num) */}
      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} className="block h-auto w-full" role="img" aria-label={`Палетоместа: занято ${k} из ${cap}`}>
        <rect x="0" y="0" width={W} height={H} rx="3" fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="1.5" />
        {/* передняя стенка */}
        <rect x="0" y="0" width="3" height={H} fill="var(--ink-3)" opacity=".6" />
        {cells.map((c, i) => {
          const col = Math.floor(i / across);
          const r = i % across;
          const x = 4 + col * cw;
          const y = y0 + r * ch;
          const dim = hover && c.id && c.id !== hover;
          return (
            <rect
              key={i}
              x={x + pad}
              y={y + pad}
              width={cw - pad * 2}
              height={ch - pad * 2}
              rx="2"
              opacity={dim ? 0.3 : 1}
              stroke={c.color ? "none" : "var(--line-strong)"}
              strokeDasharray={c.color ? undefined : "3 3"}
              strokeWidth="1"
              style={{ transition: "opacity 150ms", fill: c.color ?? "transparent" }}
              onMouseEnter={() => onHover?.(c.id)}
              onMouseLeave={() => onHover?.(null)}
            />
          );
        })}
        {cells.map((c, i) => {
          if (!c.id) return null;
          const col = Math.floor(i / across);
          const r = i % across;
          const n = orders.findIndex((o) => o.id === c.id) + 1;
          return (
            <text key={`n${i}`} className="pallet-num" x={4 + col * cw + cw / 2} y={y0 + r * ch + ch / 2} textAnchor="middle" dominantBaseline="central" fontWeight="600" fill="var(--ink)" opacity={hover && c.id !== hover ? 0.3 : i > 0 && cells[i - 1].id === c.id ? 0.55 : 0.85} style={{ pointerEvents: "none" }}>
              {n}
            </text>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap justify-between gap-x-3 text-[11.5px] text-[var(--ink-3)]">
        <span>← передняя стенка</span>
        <span className="max-sm:order-3 max-sm:w-full max-sm:text-center">
          {String(v.lengthM).replace(".", ",")} × {String(v.widthM).replace(".", ",")} м, клетка 1,2 × 0,8 м · занято {k} из {cap}
        </span>
        <span>двери →</span>
      </figcaption>
    </figure>
  );
}

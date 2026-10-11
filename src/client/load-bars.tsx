"use client";

import { freeOf, loadOf, tons, num, type Cap } from "@/lib/freight";
import type { SOrder } from "@/lib/snapshot";
import { m3 } from "./format";
import { Bar, cx, Tween } from "./ui";

/** «свободно 6,2 т / 24 м³ / 9 пал.» и три тонкие полосы: вес, объём, палеты */
export function LoadBars({ cap, orders, size = "sm", testId, loaded }: { cap: Cap; orders: SOrder[]; size?: "sm" | "lg"; testId?: string; loaded?: boolean }) {
  const load = loadOf(orders);
  const free = freeOf(load, cap);
  if (size === "sm") {
    // у уехавшего рейса догружать нечего: показываем, сколько загружено
    const cols = [
      { k: "т", v: tons(Math.max(0, loaded ? load.kg : free.kg)), share: load.kg / cap.capacityKg, label: "Вес" },
      { k: "м³", v: m3(Math.max(0, loaded ? load.m3 : free.m3)), share: load.m3 / cap.volumeM3, label: "Объём" },
      { k: "пал.", v: String(Math.max(0, loaded ? load.pal : free.pal)), share: load.pal / cap.pallets, label: "Палеты" },
    ];
    return (
      <div className="grid min-w-0 grid-cols-3 gap-2" data-testid={testId} title={`${loaded ? "Загружено" : "Свободно"}: ${cols.map((c) => `${c.v} ${c.k}`).join(", ")}`}>
        {cols.map((c) => (
          <div key={c.k} className="min-w-0">
            <div className="whitespace-nowrap text-[12.5px]">
              <span className="font-medium">{c.v}</span>&nbsp;<span className="text-[var(--ink-3)]">{c.k}</span>
            </div>
            <div className="mt-1">
              <Bar share={c.share} label={`${c.label}: занято ${Math.round(c.share * 100)}%`} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  const rows: { k: string; used: number; total: number; unit: string; fmt: (n: number) => string }[] = [
    { k: "Вес", used: load.kg, total: cap.capacityKg, unit: "т", fmt: (n) => tons(n) },
    { k: "Объём", used: load.m3, total: cap.volumeM3, unit: "м³", fmt: (n) => num(Math.round(n * 10) / 10, 1) },
    { k: "Палетоместа", used: load.pal, total: cap.pallets, unit: "пал.", fmt: (n) => String(Math.round(n)) },
  ];
  return (
    <div className="grid grid-cols-3 gap-5 max-sm:gap-3" data-testid={testId}>
      {rows.map((r) => (
        <div key={r.k} className="min-w-0">
          <div className="text-[12px] text-[var(--ink-3)]">{r.k}</div>
          <div className="mt-0.5 whitespace-nowrap text-[15px] font-medium">
            <Tween value={r.used} format={r.fmt} /> <span className="text-[var(--ink-3)]">из&nbsp;{r.fmt(r.total)}&nbsp;{r.unit}</span>
          </div>
          <div className="mt-1.5">
            <Bar share={r.used / r.total} label={r.k} testId={`bar-${r.k}`} />
          </div>
          <div className={cx("mt-1 whitespace-nowrap text-[12px]", r.used >= r.total - 1e-6 ? "text-[var(--warn)]" : "text-[var(--ink-3)]")}>
            свободно <Tween value={Math.max(0, r.total - r.used)} format={r.fmt} />&nbsp;{r.unit}
          </div>
        </div>
      ))}
    </div>
  );
}

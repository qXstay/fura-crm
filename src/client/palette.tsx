"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DOC_KIND, dayNum, orderNo, ORDER_STATUS, tripShort } from "./format";
import { Icon, type IconName } from "./icons";
import { go } from "./router";
import { indexOf, useData } from "./store";
import { cx } from "./ui";

type Hit = { id: string; group: string; icon: IconName; title: string; sub: string; href: string };

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** Поиск по всему: заявки, рейсы, клиенты, документы по номеру, городу или названию. Ctrl+K. */
export function Palette({ onClose }: { onClose: () => void }) {
  const s = useData();
  const ix = indexOf(s);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const hits = useMemo<Hit[]>(() => {
    const t = norm(q.trim());
    const digits = t.replace(/\D/g, "");
    const nav: Hit[] = [
      { id: "n-new", group: "Перейти", icon: "plus", title: "Новая заявка", sub: "N", href: "/orders/new" },
      { id: "n-orders", group: "Перейти", icon: "orders", title: "Заявки", sub: "", href: "/orders" },
      { id: "n-trips", group: "Перейти", icon: "trips", title: "Рейсы", sub: "", href: "/trips" },
      { id: "n-docs", group: "Перейти", icon: "docs", title: "Документы", sub: "", href: "/documents" },
      { id: "n-clients", group: "Перейти", icon: "clients", title: "Клиенты", sub: "", href: "/clients" },
      { id: "n-money", group: "Перейти", icon: "money", title: "Деньги", sub: "", href: "/money" },
    ];
    if (!t) return nav;
    const out: Hit[] = [];
    for (const o of s.orders) {
      const c = ix.client.get(o.clientId);
      const hay = norm(`${o.seq} ${orderNo(o.seq)} ${o.loadCity} ${o.unloadCity} ${o.cargo} ${c?.name ?? ""}`);
      if (hay.includes(t) || (digits.length >= 3 && String(o.seq).includes(digits))) {
        out.push({ id: o.id, group: "Заявки", icon: "orders", title: `№ ${String(o.seq).padStart(4, "0")} · ${o.loadCity} → ${o.unloadCity}, ${o.cargo}`, sub: `${c?.name ?? ""} · ${ORDER_STATUS[o.status].label}`, href: `/orders/${o.id}` });
      }
      if (out.length >= 8) break;
    }
    let n = 0;
    for (const tr of s.trips) {
      const r = ix.route.get(tr.routeId);
      const hay = norm(`рейс ${tr.number} ${r?.fromCity} ${r?.toCity}`);
      if (hay.includes(t) || (digits && String(tr.number).includes(digits))) {
        out.push({ id: tr.id, group: "Рейсы", icon: "trips", title: `Рейс ${tripShort(tr)} · ${r?.fromCity} → ${r?.toCity}`, sub: "", href: `/trips/${tr.id}` });
        if (++n >= 5) break;
      }
    }
    n = 0;
    for (const c of s.clients) {
      const hay = norm(`${c.name} ${c.phones.join(" ")} ${c.taxId ?? ""}`);
      if (hay.includes(t) || (digits.length >= 4 && c.phones.some((p) => p.replace(/\D/g, "").includes(digits)))) {
        out.push({ id: c.id, group: "Клиенты", icon: "clients", title: c.name, sub: c.phones[0] ?? "", href: `/clients/${c.id}` });
        if (++n >= 5) break;
      }
    }
    n = 0;
    for (const d of s.docs) {
      const hay = norm(`${DOC_KIND[d.kind]} ${d.number}`);
      if (hay.includes(t)) {
        out.push({ id: d.id, group: "Документы", icon: "docs", title: `${DOC_KIND[d.kind]} № ${d.number}`, sub: `от ${dayNum(d.date)}`, href: `/documents/${d.id}` });
        if (++n >= 5) break;
      }
    }
    return [...out, ...nav.filter((x) => norm(x.title).includes(t))];
  }, [q, s, ix]);
  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const open = (h: Hit) => {
    onClose();
    go(h.href, { top: !h.href.match(/^\/(orders|clients|documents)\/./) });
  };
  if (typeof document === "undefined") return null;
  let lastGroup = "";
  return createPortal(
    <div className="anim-fade fixed inset-0 z-[75] flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="pop anim-pop w-full max-w-[600px] overflow-hidden" role="dialog" aria-label="Поиск" data-testid="palette">
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-3">
          <Icon name="search" className="text-[var(--ink-3)]" />
          <input
            autoFocus
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[var(--ink-3)]"
            placeholder="Номер заявки или рейса, город, клиент, документ"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="palette-input"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (hits[active]) open(hits[active]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div ref={list} className="max-h-[56vh] overflow-y-auto p-1.5">
          {hits.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-[var(--ink-3)]">Ничего не нашли.</div>}
          {hits.map((h, i) => {
            const head = h.group !== lastGroup;
            lastGroup = h.group;
            return (
              <div key={`${h.group}-${h.id}`}>
                {head && <div className="px-2.5 pb-1 pt-2 text-[11.5px] font-medium text-[var(--ink-3)]">{h.group}</div>}
                <button data-i={i} className={cx("menu-item", i === active && "bg-[var(--hover)]")} onMouseEnter={() => setActive(i)} onClick={() => open(h)} data-testid="palette-hit">
                  <Icon name={h.icon} size={15} className="text-[var(--ink-3)]" />
                  <span className="min-w-0 flex-1 truncate">{h.title}</span>
                  {h.sub && <span className="max-w-[40%] truncate text-[12px] text-[var(--ink-3)]">{h.sub}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

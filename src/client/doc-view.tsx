"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DocSheet } from "@/components/doc-sheet";
import type { DocPack, DocPage, Missing } from "@/lib/docs/types";

// ---------- Загрузка листов с кэшем ----------

type DocData = { pages: DocPage[]; title: string; ready: boolean; missing: Missing[] };
const docCache = new Map<string, Promise<DocData>>();
const packCache = new Map<string, Promise<DocPack>>();

/** Лист документа: собирается на сервере по модели в мм. Подпись sig меняется, когда меняются данные документа. */
export function loadDoc(id: string, sig: string): Promise<DocData> {
  const key = `${id}|${sig}`;
  let p = docCache.get(key);
  if (!p) {
    p = fetch(`/api/docs/${id}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Документ не открылся"))));
    p.catch(() => docCache.delete(key));
    docCache.set(key, p);
  }
  return p;
}

export function loadPack(tripId: string, sig: string): Promise<DocPack> {
  const key = `${tripId}|${sig}`;
  let p = packCache.get(key);
  if (!p) {
    p = fetch(`/api/trips/${tripId}/docs`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Пакет не открылся"))));
    p.catch(() => packCache.delete(key));
    packCache.set(key, p);
  }
  return p;
}

export function useLoaded<T>(load: () => Promise<T>, key: string): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({ key: "", data: null, error: null });
  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && setState({ key, data, error: null }),
      (e) => alive && setState({ key, data: null, error: e instanceof Error ? e.message : "Не открылось" }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? { data: state.data, error: state.error } : { data: null, error: null };
}

// ---------- Листы в ширину колонки ----------

export function Pages({ pages, gap = 16 }: { pages: DocPage[]; gap?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className="flex flex-col items-center" style={{ gap }} data-testid="doc-pages">
      {w > 0 &&
        pages.map((p, i) => {
          const scale = Math.min(w, 760) / p.w;
          return <DocSheet key={i} page={p} scale={scale} canvasForm shadow />;
        })}
    </div>
  );
}

// ---------- Печать ----------

/** Печать листов: отдельный корень на всю страницу, стили печати прячут остальное */
export function PrintRoot({ pages, onDone }: { pages: DocPage[]; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => {
      window.print();
      onDone();
    }, 300);
    return () => clearTimeout(t);
  }, [onDone]);
  if (typeof document === "undefined") return null;
  // 1 мм = 3,78 px на бумаге
  return createPortal(
    <div id="print-root" aria-hidden="true" style={{ position: "fixed", left: -10000, top: 0 }}>
      {pages.map((p, i) => (
        <div key={i} className="print-page" data-land={p.w > p.h}>
          <DocSheet page={p} scale={3.7795} shadow={false} />
        </div>
      ))}
    </div>,
    document.body,
  );
}

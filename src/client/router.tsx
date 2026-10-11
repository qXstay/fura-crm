"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { forwardRef } from "react";

/**
 * Переход внутри приложения без запроса к серверу: Next синхронизирует usePathname и useSearchParams
 * с history.pushState. Обновление страницы по этому адресу открывает то же самое.
 */
export function go(href: string, opts: { replace?: boolean; top?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const cur = window.location.pathname + window.location.search;
  if (cur === href) return;
  if (opts.replace) window.history.replaceState(null, "", href);
  else window.history.pushState(null, "", href);
  if (opts.top) window.scrollTo({ top: 0 });
}

export function useRoute() {
  const path = usePathname() || "/";
  const q = useSearchParams();
  const parts = path.split("/").filter(Boolean);
  return { path, parts, q };
}

/** Новый адрес с изменёнными параметрами запроса */
export function withQuery(path: string, q: URLSearchParams, patch: Record<string, string | null>) {
  const n = new URLSearchParams(q);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") n.delete(k);
    else n.set(k, v);
  }
  const s = n.toString();
  return s ? `${path}?${s}` : path;
}

type AProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; replace?: boolean; top?: boolean };

/** Ссылка внутри приложения: обычный href (новая вкладка работает), нажатие без перезагрузки */
export const A = forwardRef<HTMLAnchorElement, AProps>(function A({ href, replace, top, onClick, ...rest }, ref) {
  return (
    <a
      ref={ref}
      href={href}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        go(href, { replace, top });
      }}
      {...rest}
    />
  );
});

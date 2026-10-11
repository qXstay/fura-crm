import { getCtx } from "@/lib/auth";
import { loadTripDoc } from "@/lib/docs/data";
import { buildTripPack, DEFAULT_CMR_COPIES } from "@/lib/docs/pack";
import { renderPdf } from "@/lib/docs/pdf";
import { allow } from "@/lib/rate-guard";

export const dynamic = "force-dynamic";

/** Пакет водителя одним PDF: только готовые документы */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await allow("pdf"))) return new Response("Слишком много запросов подряд. Подождите минуту.", { status: 429, headers: { "Retry-After": "60" } });
  const ctx = await getCtx();
  if (!ctx || !ctx.can("trips.docs")) return new Response("Войдите снова", { status: 401 });
  const { id } = await params;
  const t = await loadTripDoc(id);
  if (!t) return new Response("Рейс не найден", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const only = sp.get("only");
  const copies = Math.min(4, Math.max(1, Number(sp.get("copies")) || DEFAULT_CMR_COPIES));
  const pack = buildTripPack(t);
  const docs = pack.docs.filter((d) => d.ready && (!only || d.key === only));
  if (!docs.length) return new Response("Документы ещё не готовы: заполните недостающие поля", { status: 409 });
  const pages = docs.flatMap((d) => (d.copies ? d.copies.slice(0, copies) : d.pages).map((i) => pack.pages[i]));
  const bytes = await renderPdf(pages, { title: `Рейс № ${t.number}` });
  const name = `reys-${t.number}${only ? `-${only}` : ""}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}

import { gzipSync } from "node:zlib";
import { getCtx } from "@/lib/auth";
import { loadTripDoc } from "@/lib/docs/data";
import { buildTripPack } from "@/lib/docs/pack";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getCtx();
  if (!ctx || !ctx.can("trips.docs")) return Response.json({ error: "Войдите снова" }, { status: 401 });
  const { id } = await params;
  const t = await loadTripDoc(id);
  if (!t) return Response.json({ error: "Рейс не найден" }, { status: 404 });
  const pack = buildTripPack(t);
  const drivers = await prisma.person.findMany({ where: { kind: "DRIVER", hidden: false }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  const body = JSON.stringify({ ...pack, drivers });
  // сжимаем сами: пакет около 200 КБ разметки, в gzip в разы меньше
  if (/\bgzip\b/.test(req.headers.get("accept-encoding") ?? "")) {
    return new Response(gzipSync(body, { level: 6 }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Encoding": "gzip", "Cache-Control": "no-store", Vary: "Accept-Encoding" },
    });
  }
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

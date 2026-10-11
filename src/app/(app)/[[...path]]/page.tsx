import { redirect } from "next/navigation";
import { getCtx } from "@/lib/auth";
import { buildSnapshot } from "@/lib/snapshot-server";
import { markActivity } from "@/lib/world/activity";
import { ensureWorld } from "@/lib/world/scheduler";
import { App } from "@/client/app";

export const dynamic = "force-dynamic";

/**
 * Одна страница на всё приложение: при входе данные витрины приходят один раз,
 * дальше разделы, карточки, фильтры и поиск работают в браузере без запросов к серверу.
 */
export default async function Page() {
  markActivity();
  const ctx = await getCtx();
  if (!ctx) redirect("/login");
  if (ctx.role === "COURIER") redirect("/courier");
  await ensureWorld();
  const snapshot = await buildSnapshot(ctx);
  return <App snapshot={snapshot} />;
}

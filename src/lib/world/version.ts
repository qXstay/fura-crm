import "server-only";
import { cookies } from "next/headers";
import { prisma } from "../db";
import { WORLD_COOKIE } from "./stale";

/** Версия мира: время последней сборки в мс, «0» если мира ещё нет */
export async function worldVersion(): Promise<string> {
  const s = await prisma.worldState.findUnique({ where: { id: 1 }, select: { builtAt: true } });
  return s ? String(s.builtAt.getTime()) : "0";
}

/** Вкладка показывает мир, которого уже нет: действие с её данными применять нельзя */
export async function staleWorld(): Promise<boolean> {
  let seen: string | undefined;
  try {
    seen = (await cookies()).get(WORLD_COOKIE)?.value;
  } catch {
    return false;
  }
  if (!seen) return false;
  return seen !== (await worldVersion());
}

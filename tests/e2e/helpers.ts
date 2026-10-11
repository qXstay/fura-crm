import { expect, type Page } from "@playwright/test";

export type Role = "owner" | "manager" | "accountant" | "courier";

export async function login(page: Page, role: Role) {
  await page.goto("/login");
  await page.getByTestId(`login-${role}`).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.waitForLoadState("networkidle");
}

/** Мир с чистого листа перед сценарием: «Начать заново» в панели «Витрина» */
export async function resetWorld(page: Page) {
  await page.getByTestId("showcase-button").click();
  await page.getByTestId("showcase-reset").click();
  await page.getByTestId("showcase-reset-confirm").click();
  await expect(page.getByText(/Данные обновлены/).first()).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
}

/** Какие запросы ушли в сеть за время действия: ответы из кэша браузера не считаются */
export async function countRequests(page: Page, action: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  const sent = new Map<string, string>();
  const cached = new Set<string>();
  cdp.on("Network.requestWillBeSent", (e) => sent.set(e.requestId, e.request.url));
  cdp.on("Network.requestServedFromCache", (e) => cached.add(e.requestId));
  cdp.on("Network.responseReceived", (e) => e.response.fromDiskCache && cached.add(e.requestId));
  await action();
  await page.waitForTimeout(300);
  await cdp.detach();
  return [...sent].filter(([id]) => !cached.has(id)).map(([, u]) => u);
}

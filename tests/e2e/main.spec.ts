import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { countRequests, login, resetWorld } from "./helpers";

test.describe.configure({ mode: "serial" });

test("вход владельцем одной кнопкой, справа настоящие строки заявок", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByText("Заявки, рейсы и документы перевозчика сборных грузов между Россией и Беларусью")).toBeVisible();
  await expect(page.getByText("Данные вымышленные, вход в один клик.")).toBeVisible();
  await expect(page.getByTestId("login-preview").getByTestId("order-row").first()).toBeVisible();
  await page.getByTestId("login-owner").click();
  await expect(page.getByTestId("dashboard")).toBeVisible();
  await resetWorld(page);
});

test("переход между разделами и назад без запросов к серверу", async ({ page }) => {
  await login(page, "owner");
  await page.waitForTimeout(500);
  const urls = await countRequests(page, async () => {
    for (const s of ["orders", "trips", "documents", "clients", "money", "dashboard"]) {
      await page.getByTestId(`nav-${s}`).click();
      await expect(page.locator(`[data-testid="nav-${s}"][aria-current="page"]`)).toBeVisible();
    }
    await page.goBack();
    await expect(page.getByTestId("money-screen")).toBeVisible();
    await page.getByTestId("nav-orders").click();
    await page.getByTestId("order-row").first().click();
    await expect(page.getByTestId("order-card")).toBeVisible();
    await page.keyboard.press("Escape");
  });
  expect(urls).toEqual([]);
});

test("карточка заявки сбоку: адрес меняется, обновление открывает её же, ↑↓ листают, Esc закрывает", async ({ page }) => {
  await login(page, "owner");
  await page.getByTestId("nav-orders").click();
  await page.getByTestId("order-row").nth(2).click();
  await expect(page.getByTestId("order-card")).toBeVisible();
  const url = page.url();
  expect(url).toMatch(/\/orders\/[\w-]+$/);
  const title = await page.getByTestId("order-card-title").innerText();
  expect(title).toMatch(/^Заявка .+ → .+, .+, от \d+ \S+$/);
  for (const block of ["card-route", "card-calc", "card-rate", "card-client", "card-trip"]) await expect(page.getByTestId(block)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("order-card-title")).toHaveText(title);
  await page.keyboard.press("ArrowDown");
  await expect(page).not.toHaveURL(url);
  await page.keyboard.press("ArrowUp");
  await expect(page).toHaveURL(url);
  await page.getByTestId("card-tabs").getByText("История").click();
  await expect(page.getByTestId("history")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByTestId("order-card")).toHaveCount(0);
});

test("подсказки городов: Enter берёт город, а не деревню; ⇄ меняет местами", async ({ page }) => {
  await login(page, "owner");
  await page.getByTestId("nav-orders").click();
  await page.getByTestId("filter-to").fill("Минск");
  const first = page.getByTestId("filter-to-list").locator("li").first();
  await expect(first).toContainText("Беларусь");
  await expect(first).not.toContainText("д.");
  await page.getByTestId("filter-to").press("Enter");
  await expect(page.getByTestId("filter-to")).toHaveValue("Минск");
  await page.getByTestId("filter-from").fill("Моск");
  await page.getByTestId("filter-from").press("Enter");
  await expect(page.getByTestId("filter-from")).toHaveValue("Москва");
  const found = await page.getByTestId("orders-found").innerText();
  await page.getByTestId("filter-swap").click();
  await expect(page.getByTestId("filter-from")).toHaveValue("Минск");
  await expect(page.getByTestId("filter-to")).toHaveValue("Москва");
  await expect(page.getByTestId("orders-found")).not.toHaveText(found);
  await page.getByTestId("filters-clear").click();
});

test("⌘K: поиск по номеру рейса, городу и клиенту", async ({ page }) => {
  await login(page, "owner");
  await page.keyboard.press("Control+k");
  await page.getByTestId("palette-input").fill("Самовар");
  await expect(page.getByTestId("palette-hit").first()).toContainText("Самовар");
  await page.getByTestId("palette-input").fill("Гродно");
  await expect(page.getByTestId("palette").getByText("Рейсы")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("palette")).toHaveCount(0);
});

test("заявка Москва → Минск в рейс: неподходящие рейсы видны с причиной, рейс не перегружается", async ({ page }) => {
  await login(page, "owner");
  await page.goto("/trips/trip-now-loading");
  const bars0 = await page.getByTestId("trip-bars").innerText();
  const n0 = await page.getByTestId("trip-order-row").count();
  await expect(page.getByTestId("fit-row").first()).toBeVisible();
  await page.getByTestId("fit-add").first().click();
  await expect(page.getByTestId("trip-order-row")).toHaveCount(n0 + 1);
  await expect(page.getByTestId("trip-bars")).not.toHaveText(bars0);
  // не влезающие остаются с причиной
  await page.getByTestId("trip-nofit-toggle").click();
  await expect(page.getByTestId("nofit-row").first()).toContainText(/не влезет|кузов|отдельная/);
  // из списка заявок: в меню «В рейс» рейс, куда не влезет, неактивен
  await page.getByTestId("nav-orders").click();
  await page.getByTestId("chip-status").click();
  await page.getByTestId("chip-status-opt").first().click();
  await page.keyboard.press("Escape");
  await page.getByTestId("order-add-trip").first().click();
  await expect(page.getByTestId("to-trip-option").first()).toBeVisible();
  await page.keyboard.press("Escape");
});

test("пакет водителя: складской список, CMR, договоры-заявки, PDF скачивается и открывается", async ({ page }) => {
  await login(page, "owner");
  await page.getByTestId("dash-pack-open").click();
  await expect(page.getByTestId("pack-panel")).toBeVisible();
  await expect(page.getByTestId("pack-doc-warehouse")).toBeVisible();
  await expect(page.getByTestId("pack-doc-cmr")).toContainText("3 экземпляра");
  await expect(page.getByTestId("pack-doc-contract")).toBeVisible();
  await expect(page.getByTestId("pack-preview").locator("[data-doc]").first()).toBeVisible();
  const dl = page.waitForEvent("download");
  await page.getByTestId("pack-pdf").click();
  const file = await (await dl).path();
  const buf = fs.readFileSync(file!);
  expect(buf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(buf.length).toBeLessThan(2 * 1024 * 1024);
});

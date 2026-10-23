import { expect, test, type Page } from "@playwright/test";
import { NAV_ITEMS } from "../../src/lib/nav";

// Requires a seeded database (npm run db:seed).

async function loginAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("administrator can log in and open every sidebar page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await loginAs(page, "Alex Admin");
  const sidebar = page.getByRole("navigation", { name: "Modules" });

  for (const item of NAV_ITEMS) {
    await test.step(item.label, async () => {
      await sidebar.getByRole("link", { name: item.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${item.href}$`));
      await expect(page.getByRole("heading", { level: 1, name: item.label })).toBeVisible();
    });
  }

  expect(errors).toEqual([]);
});

test("search finds a work order and opening it adds it to recent items", async ({ page }) => {
  await loginAs(page, "Olivia Office");
  await page.getByRole("searchbox", { name: "Search" }).fill("WO-000005");
  await page.getByRole("searchbox", { name: "Search" }).press("Enter");
  await page.getByRole("main").getByRole("link", { name: /WO-000005/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: /WO-000005/ })).toBeVisible();
  await expect(page.getByTestId("recent-items").getByRole("link").first()).toContainText("WO-000005");
});

test("technicians only see their modules and are blocked from others", async ({ page }) => {
  await loginAs(page, "Marcus Lindqvist");
  const sidebar = page.getByRole("navigation", { name: "Modules" });
  await expect(sidebar.getByRole("link", { name: "Work Orders", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Invoices", exact: true })).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);

  await page.goto("/invoices");
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.goto("/projects");
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.goto("/settings/tax-levels");
  await expect(page).toHaveURL(/\/forbidden$/);
});

test("administrator edits lookup tables in Settings, including type-specific fields", async ({ page }) => {
  await loginAs(page, "Alex Admin");
  await page.goto("/settings/labor-rates");
  const row = page.locator("li").filter({ hasText: "Journeyperson" }).first();
  await row.getByText("Edit ▾").click();
  await row.getByRole("textbox", { name: "Sell per hour" }).fill("119.50");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("Saved “Journeyperson”.")).toBeVisible();
  await page.reload();
  await expect(page.locator("li").filter({ hasText: "Journeyperson" }).first()).toContainText("Sell per hour: $119.50");

  // Bad input is refused with a message beside the field.
  const again = page.locator("li").filter({ hasText: "Journeyperson" }).first();
  await again.getByText("Edit ▾").click();
  await again.getByRole("textbox", { name: "Sell per hour" }).fill("lots");
  await again.getByRole("button", { name: "Save" }).click();
  await expect(again.getByText("Sell per hour must be an amount like 125.00")).toBeVisible();

  // Put it back for reruns.
  await again.getByRole("textbox", { name: "Sell per hour" }).fill("115.00");
  await again.getByRole("button", { name: "Save" }).click();
  await expect(again.getByText("Saved “Journeyperson”.")).toBeVisible();
});

test("a user awaiting access sees nothing until an administrator assigns a role", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /^Nolan Newhire/ }).click();
  await expect(page).toHaveURL(/\/pending$/);
  await page.goto("/work-orders");
  await expect(page).toHaveURL(/\/pending$/);

  const admin = await (await browser.newContext()).newPage();
  await loginAs(admin, "Alex Admin");
  await admin.goto("/settings/users");
  const row = admin.getByRole("row").filter({ hasText: "Nolan Newhire" });
  await row.getByRole("combobox", { name: "Role for Nolan Newhire" }).selectOption("TECHNICIAN");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("Saved")).toBeVisible();

  await page.goto("/work-orders");
  await expect(page.getByRole("heading", { level: 1, name: "Work Orders" })).toBeVisible();

  // Put it back so reruns start from the seeded state.
  await row.getByRole("combobox", { name: "Role for Nolan Newhire" }).selectOption("PENDING");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("Saved")).toBeVisible();
});

test("administrator sets markup tiers and quotes show the suggested markup", async ({ page }) => {
  await loginAs(page, "Alex Admin");
  await page.goto("/settings/markup-tiers");
  // Seeded defaults: $0 → 40%, $1,000 → 30%, $5,000 → 20%, $25,000 → 15%. Raise the $1,000 tier to 35%.
  await expect(page.getByRole("textbox", { name: "Tier 2 from" })).toHaveValue("1000.00");
  await page.getByRole("textbox", { name: "Tier 2 markup" }).fill("35");
  await page.getByRole("button", { name: "Save tiers" }).click();
  await expect(page.getByText("Saved")).toBeVisible();

  // Invalid sets are refused with a reason and nothing changes.
  await page.getByRole("textbox", { name: "Tier 1 from" }).fill("10");
  await page.getByRole("button", { name: "Save tiers" }).click();
  await expect(page.getByText("The first tier must start at $0")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Tier 1 from" })).toHaveValue("0.00");
  await expect(page.getByRole("textbox", { name: "Tier 2 markup" })).toHaveValue("35");

  // Q-000001 has ~$2,282 of material and was priced at the 30% tier; it now shows the new suggestion.
  await page.goto("/search?q=Q-000001");
  await page.getByRole("main").getByRole("link", { name: /Q-000001/ }).click();
  await expect(page.getByText("30% (suggested 35%)")).toBeVisible();

  // Put the placeholder back for reruns.
  await page.goto("/settings/markup-tiers");
  await page.getByRole("textbox", { name: "Tier 2 markup" }).fill("30");
  await page.getByRole("button", { name: "Save tiers" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});

test("projects show the revised contract, and progress invoices show holdback", async ({ page }) => {
  await loginAs(page, "Olivia Office");
  await page.goto("/search?q=P-0001");
  await page.getByRole("main").getByRole("link", { name: /P-0001/ }).click();
  // $248,500 original + $7,850 approved CO; the $12,400 CO is still pending.
  await expect(page.getByText("$256,350.00")).toBeVisible();
  await expect(page.getByText("$12,400.00", { exact: true })).toBeVisible();
  await expect(page.getByText("10% · $8,600.00 held")).toBeVisible();

  await page.goto("/search?q=INV-000006");
  await page.getByRole("main").getByRole("link", { name: /INV-000006/ }).click();
  await expect(page.getByText("Progress claim")).toBeVisible();
  await expect(page.getByText("$86,000.00")).toBeVisible();
  await expect(page.getByText("$85,914.00")).toBeVisible();
});

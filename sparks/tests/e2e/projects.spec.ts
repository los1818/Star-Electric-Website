import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const stamp = () => Date.now().toString(36).toUpperCase();

test("office creates a project, builds its schedule of values and approves a change order", async ({ page }) => {
  const name = `E2E Lab renovation ${stamp()}`;
  await loginAs(page, "Olivia Office");
  await page.getByText("+ New", { exact: true }).click();
  await page.getByRole("link", { name: "Project", exact: true }).click();

  await page.getByLabel("Project name").fill(name);
  await page.getByRole("combobox", { name: /^Customer/ }).selectOption({ label: "Mapleview Community Clinic" });
  await page.getByLabel("Contract value ($)").fill("50,000");
  await page.getByLabel("Holdback (%)").fill("10");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(page.getByText(/^Job \d{7}$/)).toBeVisible();
  await expect(page.getByText(/^P-\d{4}/).first()).toBeVisible();
  await expect(page.getByText("No schedule of values yet.")).toBeVisible();

  // Two SOV lines that add up to the contract.
  for (const [desc, value] of [["Rough-in", "30000"], ["Fixtures and trim", "20000"]]) {
    await page.getByText("+ Add line").click();
    const form = page.locator("details").filter({ hasText: "+ Add line" });
    await form.getByLabel("Description").fill(desc);
    await form.getByLabel("Value ($)").fill(value);
    await form.getByRole("button", { name: "Add line" }).click();
    await expect(page.getByText("Line added.")).toBeVisible();
    await page.reload();
  }
  await expect(page.getByRole("row").filter({ hasText: "Total" })).toContainText("$50,000.00");
  await expect(page.getByText(/Adjust the lines/)).toHaveCount(0);

  // A change order: pending first, then approved and added to the schedule.
  await page.getByText("+ Add change order").click();
  const co = page.locator("details").filter({ hasText: "+ Add change order" });
  await co.getByLabel("Title").fill("Add emergency lighting in corridor");
  await co.getByLabel("Amount ($)").fill("4,250");
  await co.getByRole("button", { name: "Add change order" }).click();
  await expect(page.getByText("CO-001 added as Pending.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Revised contract").locator("..")).toContainText("$50,000.00");

  await page.getByRole("button", { name: "Approve + add to schedule" }).click();
  const coRow = page.locator("li").filter({ hasText: "Add emergency lighting in corridor" }).first();
  await expect(coRow.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText("Revised contract").locator("..")).toContainText("$54,250.00");
  await expect(page.getByRole("row").filter({ hasText: "Total" })).toContainText("$54,250.00");
  await expect(page.getByRole("button", { name: "Approve + add to schedule" })).toHaveCount(0);
});

test("technicians can't open projects", async ({ page }) => {
  await loginAs(page, "Marcus Lindqvist");
  await page.goto("/projects/new");
  await expect(page).toHaveURL(/\/forbidden$/);
});

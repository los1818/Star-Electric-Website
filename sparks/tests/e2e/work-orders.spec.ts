import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const stamp = () => Date.now().toString(36).toUpperCase();

test("office creates and edits a work order; the assigned tech moves it along and adds a note; another tech can't see it", async ({ page, browser }) => {
  const summary = `E2E panel swap ${stamp()}`;
  await loginAs(page, "Olivia Office");

  // From the customer page, so the customer is pre-filled.
  await page.goto("/customers?q=Flatland");
  await page.getByRole("main").getByRole("link", { name: "Flatland Fabrication Inc.", exact: true }).click();
  await page.getByRole("link", { name: "+ Work order" }).click();
  await expect(page.getByRole("combobox", { name: /^Customer/ })).not.toHaveValue("");

  // Missing summary → error, values kept.
  await page.getByRole("button", { name: "Create work order" }).click();
  await expect(page.getByText("Summary is required")).toBeVisible();

  await page.getByLabel("Job site").selectOption({ index: 1 });
  await page.getByLabel("Summary").fill(summary);
  await page.getByLabel("Priority").selectOption({ label: "High" });
  await page.getByLabel("Planned start").fill("2026-11-03T08:00");
  await page.getByLabel("Planned end").fill("2026-11-03T07:00"); // before start
  await page.getByRole("checkbox", { name: /Marcus Lindqvist/ }).check();
  await page.getByRole("checkbox", { name: /Jasmine Okafor/ }).check();
  await page.getByRole("button", { name: "Create work order" }).click();
  await expect(page.getByText("Planned end must be after the start")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Jasmine Okafor/ })).toBeChecked(); // crew kept after error

  await page.getByLabel("Planned end").fill("2026-11-03T12:00");
  await page.getByLabel("Lead").selectOption({ label: "Marcus Lindqvist" });
  await page.getByRole("button", { name: "Create work order" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(summary);
  await expect(page.getByText("Scheduled", { exact: true })).toBeVisible(); // crew + time → Scheduled
  await expect(page.getByText("Tue, Nov 3, 8:00 a.m. – 12:00 p.m.")).toBeVisible();
  const woUrl = page.url();

  // Edit: drop Jasmine.
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByRole("checkbox", { name: /Jasmine Okafor/ }).uncheck();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(summary);
  await expect(page.locator("section").filter({ hasText: "Crew" }).getByText("Jasmine Okafor")).toHaveCount(0);

  // Office dispatches it.
  await page.getByLabel("New status").selectOption({ label: "Dispatched" });
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByText("Status changed to Dispatched.")).toBeVisible();

  // Marcus sees it, starts it, adds a note. He can't close or cancel it.
  const tech = await (await browser.newContext()).newPage();
  await loginAs(tech, "Marcus Lindqvist");
  await tech.goto(`/work-orders?q=${encodeURIComponent(summary)}`);
  await expect(tech.getByRole("heading", { level: 1 })).toHaveText("My Work Orders");
  await tech.getByRole("row").filter({ hasText: summary }).getByRole("link").first().click();
  await expect(tech.getByRole("heading", { level: 1 })).toContainText(summary);
  await expect(tech.getByLabel("New status")).toBeVisible();
  await expect(tech.getByRole("link", { name: "Edit" })).toHaveCount(0);
  const options = await tech.getByLabel("New status").locator("option").allTextContents();
  expect(options).toContain("In Progress");
  expect(options).not.toContain("Cancelled");
  await tech.getByLabel("New status").selectOption({ label: "In Progress" });
  await tech.getByRole("button", { name: "Update status" }).click();
  await expect(tech.getByText("Status changed to In Progress.")).toBeVisible();
  await tech.getByLabel("Add a note").fill("Old panel has aluminum feeders; need AL-rated lugs.");
  await tech.getByRole("button", { name: "Add note" }).click();
  await expect(tech.getByText("Old panel has aluminum feeders; need AL-rated lugs.")).toBeVisible();
  await expect(tech.getByText("Status changed from Dispatched to In Progress.")).toBeVisible();

  // Jasmine was removed from the crew, so she gets "not found".
  const other = await (await browser.newContext()).newPage();
  await loginAs(other, "Jasmine Okafor");
  const res = await other.goto(woUrl);
  expect(res?.status()).toBe(404);
});

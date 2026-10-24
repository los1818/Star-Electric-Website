import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

// A week with no seeded time, unique per run so reruns don't collide.
const runWeek = (() => {
  const d = new Date(Date.UTC(2027, 0, 4 + 7 * (Math.floor(Date.now() / 1000) % 200)));
  return d.toISOString().slice(0, 10); // always a Monday (Jan 4 2027 is a Monday)
})();
const day = (offset: number) => new Date(Date.parse(`${runWeek}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

test("technician enters and submits a week; office sends it back, then approves; approved time locks", async ({ page, browser }) => {
  await loginAs(page, "Marcus Lindqvist");
  await page.goto(`/timesheets?week=${runWeek}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("My timesheet");
  const add = page.locator("section").filter({ hasText: "Add time" });

  // Billable time without a work order is refused.
  await add.getByLabel("Date").fill(day(0));
  await add.getByLabel("Hours").fill("8");
  await add.getByRole("button", { name: "Add time" }).click();
  await expect(add.getByText("Regular time has to be on a work order")).toBeVisible();

  // Valid: Monday 8 h on a work order.
  await add.getByLabel("Work order").selectOption({ index: 1 });
  await add.getByRole("button", { name: "Add time" }).click();
  await expect(page.getByText("Time added.")).toBeVisible();
  await page.reload();

  // Tuesday by start/end time: 07:00–15:30 = 8.50 h.
  await add.getByLabel("Date").fill(day(1));
  await add.getByLabel("Work order").selectOption({ index: 1 });
  await add.getByLabel("Start").fill("07:00");
  await add.getByLabel("End").fill("15:30");
  await add.getByRole("button", { name: "Add time" }).click();
  await expect(page.getByText("Time added.")).toBeVisible();
  await page.reload();

  // More than 24 h on Monday is refused.
  await add.getByLabel("Date").fill(day(0));
  await add.getByLabel("Work order").selectOption({ index: 1 });
  await add.getByLabel("Hours").fill("17");
  await add.getByRole("button", { name: "Add time" }).click();
  await expect(add.getByText("That would be more than 24 hours on this day")).toBeVisible();

  await page.reload();
  await expect(page.getByText("16.50 hours")).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Submit week \(2 entries\)/ }).click();
  await expect(page.getByText("Waiting for the office to approve.")).toBeVisible();
  await expect(page.getByText("Edit", { exact: true })).toHaveCount(0); // locked for the tech

  // Office sends it back.
  const office = await (await browser.newContext()).newPage();
  await loginAs(office, "Olivia Office");
  await office.goto(`/timesheets?week=${runWeek}`);
  await expect(office.getByRole("row").filter({ hasText: "Lindqvist, Marcus" })).toContainText("2 to approve");
  await office.getByRole("link", { name: "Lindqvist, Marcus" }).click();
  await office.getByLabel("Reason for sending back").fill("Tuesday needs a description");
  await office.getByRole("button", { name: "Send back" }).click();
  await expect(office.getByText("2 draft")).toBeVisible();

  // Tech can edit again, fixes Tuesday, resubmits.
  await page.reload();
  const tuesday = page.locator("section").filter({ hasText: /Tue/ }).filter({ hasText: "8.50" });
  await tuesday.getByText("Edit", { exact: true }).click();
  await tuesday.getByLabel("What you did").fill("Rough-in, 2nd floor east");
  await tuesday.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Entry updated.")).toBeVisible();
  await page.reload();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Submit week/ }).click();
  await expect(page.getByText("Waiting for the office to approve.")).toBeVisible();

  // Office approves.
  await office.reload();
  await office.getByRole("button", { name: "Approve 2 submitted entries" }).click();
  await expect(office.getByText("This week is approved.")).toBeVisible();
  await expect(office.getByText("Edit", { exact: true })).toHaveCount(0); // locked for office too
});

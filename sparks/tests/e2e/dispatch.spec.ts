import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

// A future week unique to this run (Mondays from 2028-01-03).
const monday = new Date(Date.UTC(2028, 0, 3 + 7 * (Math.floor(Date.now() / 1000) % 300))).toISOString().slice(0, 10);
const day = (n: number) => new Date(Date.parse(`${monday}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

test("office books an electrician for several weekdays, overlaps are refused, the work order picks up the crew member", async ({ page }) => {
  await loginAs(page, "Olivia Office");
  await page.goto(`/dispatch?week=${monday}`);
  const book = page.locator("section").filter({ hasText: "Book someone" });
  const woLabel = (await book.getByLabel("Work order").locator("option", { hasText: "WO-000015" }).textContent())!;

  // Thursday through next Monday = Thu, Fri, Mon (weekend skipped).
  await book.getByLabel("Electrician").selectOption({ label: "Riley Thiessen" });
  await book.getByLabel("Work order").selectOption({ label: woLabel });
  await book.getByLabel("First day").fill(day(3));
  await book.getByLabel("Through (optional)").fill(day(7));
  await book.getByRole("textbox", { name: /^Start/ }).fill("08:00");
  await book.getByRole("textbox", { name: /^End/ }).fill("16:00");
  await book.getByRole("button", { name: "Book" }).click();
  await expect(page.getByText("Booked Riley for 3 days.")).toBeVisible();

  await page.reload();
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "Riley Thiessen" }) });
  await expect(row.getByText(/8:00\s?a\.m\.–4:00\s?p\.m\./)).toHaveCount(2); // Thu + Fri this week; Mon is next week

  // Overlap on Friday is refused…
  await book.getByLabel("Electrician").selectOption({ label: "Riley Thiessen" });
  await book.getByLabel("First day").fill(day(4));
  await book.getByRole("textbox", { name: /^Start/ }).fill("13:00");
  await book.getByRole("textbox", { name: /^End/ }).fill("15:00");
  await book.getByLabel("Notes").fill("Safety training");
  await book.getByRole("button", { name: "Book" }).click();
  await expect(page.getByText(/Riley is already booked then \(WO-000015\)/)).toBeVisible();
  // …unless double-booking is allowed.
  await book.getByLabel("Allow double-booking").check();
  await book.getByRole("button", { name: "Book" }).click();
  await expect(page.getByText("Booked Riley.")).toBeVisible();

  // The work order now has Riley on its crew and is no longer New.
  await page.goto("/search?q=WO-000015");
  await page.getByRole("main").getByRole("link", { name: /WO-000015/ }).first().click();
  await expect(page.locator("section").filter({ hasText: "Crew" }).getByText("Riley Thiessen")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 }).locator("..").getByText("Scheduled", { exact: true })).toBeVisible();

  // Remove the training booking from the board.
  await page.goto(`/dispatch?week=${monday}`);
  const training = page.locator("details").filter({ hasText: "Safety training" });
  await training.locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await training.getByRole("button", { name: "Remove" }).click();
  await expect(page.locator("details").filter({ hasText: "Safety training" })).toHaveCount(0);
});

test("technicians can't open the dispatch board", async ({ page }) => {
  await loginAs(page, "Marcus Lindqvist");
  await page.goto("/dispatch");
  await expect(page).toHaveURL(/\/forbidden$/);
});

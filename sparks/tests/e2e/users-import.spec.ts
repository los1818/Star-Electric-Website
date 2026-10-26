import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("an administrator adds people from a file and by hand; they can then sign in from the list", async ({ page, browser }) => {
  const tag = Date.now().toString(36);
  await loginAs(page, "Alex Admin");
  await page.goto("/settings/users");

  // A file with a mistake is refused, saying which row.
  await page.getByLabel("Users file").setInputFiles({ name: "users.csv", mimeType: "text/csv", buffer: Buffer.from("Name,User Name,Role\nBad Role,badr,Wizard\n") });
  await page.getByRole("button", { name: "Import users" }).click();
  await expect(page.getByText(/Row 2: Bad Role/)).toBeVisible();

  const csv = `Name,User Name,Role,Email\nTest Sparky ${tag},sparky${tag},Basic User,\nTest Boss ${tag},boss${tag},Administrator,\n`;
  await page.getByLabel("Users file").setInputFiles({ name: "users.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("button", { name: "Import users" }).click();
  await expect(page.getByText("2 added.", { exact: true })).toBeVisible();

  // Again, this time also listing the administrator as a Basic User: nobody is duplicated and
  // nobody's access changes (an import can't demote or lock out an administrator).
  await page.reload();
  const again = csv + "Alex Admin,,Basic User,admin@star-electric.example\n";
  await page.getByLabel("Users file").setInputFiles({ name: "users.csv", mimeType: "text/csv", buffer: Buffer.from(again) });
  await page.getByRole("button", { name: "Import users" }).click();
  await expect(page.getByText("0 added. 3 already had a login and kept their role (change it in the list below).")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Role for Alex Admin" })).toHaveValue("ADMIN");

  // Adding someone who already has a login is refused.
  await page.reload();
  await page.getByLabel("Name").fill("Alex Again");
  await page.getByLabel("Email").fill("admin@star-electric.example");
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByText(/already has a login/)).toBeVisible();

  await page.reload();
  await page.getByLabel("Name").fill(`Test Desk ${tag}`);
  await page.getByLabel("Email").fill(`desk${tag}@starelectric.ca`);
  await page.getByRole("combobox", { name: /^Role\s*\*?$/ }).selectOption("OFFICE");
  await page.getByLabel(/^Electrician/).uncheck();
  await page.getByRole("button", { name: "Add user" }).click();
  await expect(page.getByText(`Test Desk ${tag} added.`)).toBeVisible();

  // The electrician can sign in from the list and has their own timesheet (employee record).
  const tech = await browser.newPage();
  await tech.goto("/login");
  await tech.getByRole("button", { name: new RegExp(`^Test Sparky ${tag}`) }).click();
  await expect(tech).toHaveURL(/\/dashboard$/);
  await tech.goto("/timesheets");
  await expect(tech.getByRole("heading", { name: "My timesheet" })).toBeVisible();
  await expect(tech.getByText(/isn't linked to an employee/)).toHaveCount(0);
  await tech.close();
});

test("office staff can't add users", async ({ page }) => {
  await loginAs(page, "Olivia Office");
  await page.goto("/settings/users");
  await expect(page).toHaveURL(/forbidden/);
});

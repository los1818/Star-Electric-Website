import { expect, test, type Page } from "@playwright/test";

// Phase 1 screens: customers, contacts, job sites, employees, vendors. Requires a seeded DB.

async function loginAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

const stamp = () => Date.now().toString(36).toUpperCase();

test("office creates a customer with a job site, finds it, edits and deactivates it; admin deletes an unused one", async ({ page, browser }) => {
  const name = `E2E Wiring Co ${stamp()}`;
  await loginAs(page, "Olivia Office");

  // Create via the New menu, fixing a validation error on the way.
  await page.getByText("+ New", { exact: true }).click();
  await page.getByRole("link", { name: "Customer", exact: true }).click();
  await page.getByLabel("Customer name").fill(name);
  await page.getByLabel("Postal code").fill("12345");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByText("Choose a category")).toBeVisible();
  await expect(page.getByText("Enter a postal code like S4P 3Y2")).toBeVisible();
  await expect(page.getByLabel("Customer name")).toHaveValue(name); // kept after the error
  await page.getByLabel("Category").selectOption({ label: "Industrial" });
  await page.getByLabel("Postal code").fill("s4n 7k2");
  await page.getByLabel("Phone").fill("306 555 0177");
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(page.getByText("(306) 555-0177")).toBeVisible();
  await expect(page.getByText("S4N 7K2")).toBeVisible();
  const customerUrl = page.url();

  // Add a job site from the customer page.
  await page.getByRole("link", { name: "+ Add" }).click();
  await expect(page.getByLabel("Customer")).toHaveValue(/.+/);
  await page.getByLabel("Site name").fill("North Yard");
  await page.getByLabel("Street").fill("1450 Fleet St");
  await page.getByLabel("Access notes").fill("Gate code from office.");
  await page.getByRole("button", { name: "Create job site" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("North Yard");
  await expect(page.getByText("Gate code from office.")).toBeVisible();

  // Global search finds both.
  await page.getByRole("searchbox", { name: "Search" }).fill(name);
  await page.getByRole("searchbox", { name: "Search" }).press("Enter");
  const results = page.getByRole("main");
  await expect(results.locator('a[href^="/customers/"]', { hasText: name })).toBeVisible();
  await expect(results.locator('a[href^="/job-sites/"]', { hasText: "North Yard" })).toBeVisible();

  // Edit.
  await page.goto(customerUrl);
  await page.getByRole("link", { name: "Edit" }).click();
  await page.getByLabel("Credit hold").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Credit hold", { exact: true })).toBeVisible();

  // Deactivate: hidden from the active list, shown under Inactive.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText(/Customer deactivated/)).toBeVisible();
  await page.goto(`/customers?q=${encodeURIComponent(name)}`);
  await expect(page.getByText("No customers match those filters.")).toBeVisible();
  await page.goto(`/customers?q=${encodeURIComponent(name)}&status=inactive`);
  await expect(page.getByRole("main").getByRole("link", { name: new RegExp(name) })).toBeVisible();

  // Office can't delete; an admin can delete a customer with no history, but not this one (it has a site).
  await page.goto(customerUrl);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  const admin = await (await browser.newContext()).newPage();
  await loginAs(admin, "Alex Admin");
  await admin.goto(customerUrl);
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Delete" }).click();
  await expect(admin.getByText(/can't be deleted\. Deactivate it instead/)).toBeVisible();

  const spare = `E2E Mistake ${stamp()}`;
  await admin.goto("/customers/new");
  await admin.getByLabel("Customer name").fill(spare);
  await admin.getByLabel("Category").selectOption({ label: "Commercial" });
  await admin.getByRole("button", { name: "Create customer" }).click();
  await expect(admin.getByRole("heading", { level: 1 })).toContainText(spare);
  admin.once("dialog", (d) => d.accept());
  await admin.getByRole("button", { name: "Delete" }).click();
  await expect(admin).toHaveURL(/\/customers$/);
});

test("contacts: add, make primary, edit and remove", async ({ page }) => {
  await loginAs(page, "Olivia Office");
  await page.goto("/customers?q=Brightwater");
  await page.getByRole("main").getByRole("link", { name: "Brightwater Retail Group", exact: true }).click();
  const last = `Tester${stamp()}`;
  await page.getByText("+ Add contact").click();
  const addForm = page.locator("details").filter({ hasText: "+ Add contact" });
  await addForm.getByLabel("First name").fill("Robin");
  await addForm.getByLabel("Last name").fill(last);
  await addForm.getByLabel("Email").fill("ROBIN@Example.com");
  await addForm.getByLabel("Primary contact").check();
  await addForm.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Contact added.")).toBeVisible();
  await expect(addForm.getByLabel("Last name")).toHaveValue(""); // form clears after success

  const item = page.locator("li").filter({ hasText: `Robin ${last}` });
  await expect(item.getByText("Primary", { exact: true })).toBeVisible();
  await expect(item.getByText("robin@example.com")).toBeVisible();
  await expect(page.getByText("Primary", { exact: true })).toHaveCount(1); // previous primary un-marked

  page.once("dialog", (d) => d.accept());
  await item.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(`Robin ${last}`)).toHaveCount(0);
});

test("admin adds an employee; office adds a vendor; technicians can't open these screens", async ({ page, browser }) => {
  await loginAs(page, "Alex Admin");
  const last = `Newhand${stamp()}`;
  await page.goto("/employees/new");
  await page.getByLabel("First name").fill("Casey");
  await page.getByLabel("Last name").fill(last);
  await page.getByLabel("Trade").selectOption({ label: "Apprentice (2nd year)" });
  await page.getByRole("button", { name: "Create employee" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(`Casey ${last}`);
  await expect(page.getByText(/^E0\d+$/)).toBeVisible();

  const office = await (await browser.newContext()).newPage();
  await loginAs(office, "Olivia Office");
  await office.goto("/employees");
  await expect(office.getByRole("link", { name: "+ New employee" })).toHaveCount(0); // admin-only
  const vendor = `E2E Supply ${stamp()}`;
  await office.goto("/vendors/new");
  await office.getByLabel("Vendor name").fill(vendor);
  await office.getByLabel("Orders email").fill("orders@example.com");
  await office.getByRole("button", { name: "Create vendor" }).click();
  await expect(office.getByRole("heading", { level: 1 })).toContainText(vendor);

  const tech = await (await browser.newContext()).newPage();
  await loginAs(tech, "Marcus Lindqvist");
  for (const path of ["/customers", "/customers/new", "/job-sites/new", "/employees", "/vendors/new", "/settings/company"]) {
    await tech.goto(path);
    await expect(tech).toHaveURL(/\/forbidden$/);
  }
});

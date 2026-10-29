import ExcelJS from "exceljs";
import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, name: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** A made-up Accubid "Ext" export with the given items: [description, qty, trade, unit, disc%]. */
async function accubidFile(items: [string, number, number, "E" | "C" | "M", number][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ext");
  ws.addRow(["Description", "Quantity", "Date", "Trade Price", "Price Unit", "Disc %", "Net Cost", "DB Labor", "Labor Unit", "Total Material", "Labor Condition"]);
  let total = 0;
  for (const [d, q, t, u, disc] of items) {
    const net = Math.round(t * (100 - disc)) / 100;
    const line = Math.round(((q * net) / { E: 1, C: 100, M: 1000 }[u]) * 100) / 100;
    total += line;
    ws.addRow([d, q, new Date("2026-09-01"), t, u, disc, net, 0.5, u, line, "Normal"]);
  }
  ws.addRow(["Totals", null, null, null, null, null, null, null, null, Math.round(total * 100) / 100, null]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test("office imports an Accubid export, updates prices by hand and by percentage, and sees the history", async ({ page, browser }) => {
  const tag = Date.now().toString(36).toUpperCase();
  const wire = `E2E ${tag} #12 THHN WIRE`;
  const box = `E2E ${tag} 4" SQ BOX`;
  await loginAs(page, "Olivia Office");

  // Not an Excel file: refused.
  await page.goto("/inventory/import");
  await page.getByLabel(/Accubid inventory export/).setInputFiles({ name: "x.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("hello") });
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByText(/isn't an Excel/)).toBeVisible();

  // First import: preview, then import with stock.
  await page.getByLabel(/Accubid inventory export/).setInputFiles({ name: "inventory.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await accubidFile([[wire, 1000, 200, "M", 0], [box, 12, 5, "E", 10]]) });
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByText("new items to add")).toBeVisible();
  await expect(page.getByRole("main")).toContainText("2 new items to add");
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page).toHaveURL(/\/inventory\?imported=2-0/);
  await expect(page.getByText("Import done: 2 new items, 0 prices updated.")).toBeVisible();

  // A newer export with a higher wire price: the preview shows the change; prices only.
  await page.goto("/inventory/import");
  await page.getByLabel(/Accubid inventory export/).setInputFiles({ name: "inventory.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await accubidFile([[wire, 1000, 220, "M", 0], [box, 12, 5, "E", 10]]) });
  await page.getByRole("button", { name: "Check the file" }).click();
  await expect(page.getByRole("main")).toContainText("1 price change (1 up, 0 down)");
  await expect(page.getByRole("row", { name: new RegExp(wire.replace(/[#"]/g, ".")) })).toContainText("+10%");
  await page.getByLabel(/Also set warehouse stock/).uncheck();
  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Import done: 0 new items, 1 price updated.")).toBeVisible();

  // Edit a price in the grid: net cost updates as you type.
  await page.goto(`/inventory/prices?q=${encodeURIComponent(`E2E ${tag}`)}`);
  const boxTrade = page.getByLabel(`Trade price for ${box}`);
  await expect(boxTrade).toHaveValue("5.00");
  await boxTrade.fill("6.00");
  await expect(page.getByRole("row", { name: /SQ BOX/ })).toContainText("$5.40"); // 6.00 less 10%
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("Saved 1 price.")).toBeVisible();

  // Raise everything matching the search by 5%.
  await page.getByLabel("Change trade prices by %").fill("5");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/Trade prices raised \+5% on 2 items/)).toBeVisible();
  // The grid shows the new prices straight away (no reload), so saving it can't undo the adjustment.
  await expect(page.getByLabel(`Trade price for ${box}`)).toHaveValue("6.30");
  await page.getByRole("button", { name: "Save prices" }).click();
  await expect(page.getByText("No prices changed.")).toBeVisible();

  // History on the item page.
  await page.goto(`/inventory?q=${encodeURIComponent(box)}`);
  await page.getByRole("main").getByRole("link", { name: box }).click();
  await expect(page.getByRole("heading", { name: "Price history" })).toBeVisible();
  await expect(page.getByText("% adjustment")).toBeVisible();
  await expect(page.getByText("Edited")).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Net cost (each)");

  // Technicians see the item and stock, never prices.
  const tech = await browser.newPage();
  await loginAs(tech, "Marcus Lindqvist");
  await tech.goto(`/inventory?q=${encodeURIComponent(box)}`);
  await expect(tech.getByRole("main").getByRole("link", { name: box })).toBeVisible();
  await expect(tech.getByRole("main")).not.toContainText("Net cost");
  await expect(tech.getByRole("main")).not.toContainText("$");
  await tech.goto("/inventory/prices");
  await expect(tech).toHaveURL(/forbidden/);
  await tech.close();
});

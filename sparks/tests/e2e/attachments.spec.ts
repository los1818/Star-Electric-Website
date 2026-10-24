import { expect, test, type Page } from "@playwright/test";

async function loginAs(page: Page, name: string, landing = /\/dashboard$/) {
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page).toHaveURL(landing);
}

// A real 1×1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");

test("a technician adds photos and a customer signature; only people who can see the work order can open them", async ({ page, browser }) => {
  const caption = `E2E panel before ${Date.now().toString(36)}`;
  await loginAs(page, "Marcus Lindqvist");
  await page.goto("/work-orders");
  await page.getByRole("main").getByRole("table").getByRole("link").first().click();
  await expect(page).toHaveURL(/\/work-orders\/[a-z0-9]+$/);
  const workOrderUrl = page.url();

  // Something that isn't a photo is refused, whatever it's named.
  const photos = page.getByLabel("Add photos");
  await photos.setInputFiles({ name: "not-really.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>") });
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("isn't a photo")).toBeVisible();

  await photos.setInputFiles([
    { name: "panel-1.png", mimeType: "image/png", buffer: PNG },
    { name: "panel-2.png", mimeType: "image/png", buffer: PNG },
  ]);
  await page.getByLabel("Caption (optional)").fill(caption);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByText("2 photos added.")).toBeVisible();
  const thumbs = page.getByRole("img", { name: caption });
  await expect(thumbs).toHaveCount(2);
  await expect.poll(() => thumbs.first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1);
  const imageUrl = await thumbs.first().getAttribute("src");
  expect(imageUrl).toMatch(/^\/api\/attachments\/[a-z0-9]+$/);

  // Customer sign-off: a blank box is refused; a signature is saved and shown.
  await page.getByRole("button", { name: "Get customer signature" }).click();
  await page.getByLabel(/^Signed by/).fill("Pat Customer");
  await page.getByRole("button", { name: "Save signature" }).click();
  await expect(page.getByText("Sign in the box first")).toBeVisible();

  const pad = page.getByLabel(/^Signature box/);
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 20 + i * 25, box.y + box.height / 2 + (i % 2 ? -20 : 20));
  await page.mouse.up();
  await page.getByRole("button", { name: "Save signature" }).click();
  await expect(page.getByText("Signature from Pat Customer saved.")).toBeVisible();
  const signature = page.getByRole("img", { name: "Signature of Pat Customer" }).last();
  await expect.poll(() => signature.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

  // Technicians can't remove a signature (only the office can).
  const signOff = page.locator("section").filter({ has: page.getByRole("heading", { name: "Customer sign-off" }) });
  await expect(signOff.getByRole("button", { name: "Remove" })).toHaveCount(0);

  // Signed out: no file.
  const anon = await browser.newContext();
  const anonResponse = await anon.request.get(imageUrl!, { maxRedirects: 0 });
  expect(anonResponse.status()).not.toBe(200);
  await anon.close();

  // Someone waiting for access: 404.
  const pending = await browser.newPage();
  await loginAs(pending, "Nolan Newhire", /\/pending$/);
  expect((await pending.request.get(imageUrl!)).status()).toBe(404);
  await pending.close();

  // Another technician gets the file only if they can see the work order.
  const other = await browser.newPage();
  await loginAs(other, "Jasmine Okafor");
  const pageStatus = (await other.request.get(workOrderUrl)).status();
  const fileStatus = (await other.request.get(imageUrl!)).status();
  expect(fileStatus).toBe(pageStatus === 404 ? 404 : 200);
  await other.close();

  // The office can remove a photo.
  const office = await browser.newPage();
  await loginAs(office, "Olivia Office");
  await office.goto(workOrderUrl);
  office.on("dialog", (d) => d.accept());
  const officeThumbs = office.getByRole("img", { name: caption });
  await expect(officeThumbs).toHaveCount(2);
  await office.getByRole("listitem").filter({ has: officeThumbs.first() }).last().getByRole("button", { name: "Remove" }).click();
  await expect(officeThumbs).toHaveCount(1);
  await office.close();
});

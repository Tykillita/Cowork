import { expect, test, type Page } from "@playwright/test";
import { createAccount, openProject, resetEmulators, seedAccessLink, seedProject, signIn, signOut, type TestAccount } from "./helpers";

let olga: TestAccount;
let beto: TestAccount;
let link: string;

test.beforeEach(async () => {
  await resetEmulators();
  olga = await createAccount("Olga");
  beto = await createAccount("Beto");
  await seedProject(olga, { id: "uno", name: "Uno" });
  link = await seedAccessLink("uno", "Uno", olga.uid);
});

async function ownerDecides(page: Page, button: string) {
  await signIn(page, olga);
  await openProject(page, "Uno");
  await page.evaluate(() => { window.location.hash = "#settings-page"; });
  await page.locator(".accessRequestRow", { hasText: "Beto" }).getByRole("button", { name: button }).click();
}

test("reject → allow → withdraw → allow → retry → approve, with history", async ({ page }) => {
  // Beto asks through the shared link.
  await signIn(page, beto, { path: link });
  await page.getByRole("button", { name: "Solicitar acceso" }).click();
  await expect(page.locator(".accessRequestDialog")).toContainText("pendiente");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await signOut(page);

  await ownerDecides(page, "Rechazar");
  await expect(page.getByText("Rechazaste la solicitud de Beto")).toBeVisible();
  await signOut(page);

  // Rejected without permission: no retry.
  await signIn(page, beto, { path: link });
  await expect(page.locator(".accessRequestDialog")).toContainText("rechazó tu solicitud");
  await expect(page.getByRole("button", { name: /Solicitar/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await signOut(page);

  // Allow, withdraw, allow again.
  await ownerDecides(page, "Permitir otra solicitud");
  const rejected = page.locator(".accessRequestRow", { hasText: "Beto" });
  await expect(rejected).toContainText("Puede volver a solicitar");
  await rejected.getByRole("button", { name: "Retirar autorización" }).click();
  await expect(rejected).not.toContainText("Puede volver a solicitar");
  await rejected.getByRole("button", { name: "Permitir otra solicitud" }).click();
  await expect(rejected).toContainText("Puede volver a solicitar");
  await signOut(page);

  // Retry from the picker list; it is pending again and consumes the permission.
  await signIn(page, beto);
  await expect(page.locator(".ownAccessRequest")).toContainText("Puedes volver a solicitar");
  await page.getByRole("button", { name: "Solicitar de nuevo" }).first().click();
  await page.locator(".accessRequestDialog").getByRole("button", { name: "Solicitar de nuevo" }).click();
  await expect(page.locator(".accessRequestDialog")).toContainText("pendiente");
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await signOut(page);

  await ownerDecides(page, "Aprobar");
  await expect(page.getByText("Beto ya forma parte de Uno")).toBeVisible();
  const history = page.locator(".accessHistoryEntries");
  await expect(history.locator("li")).toHaveCount(7);
  await expect(history).toContainText("intento 2");
  await signOut(page);

  await signIn(page, beto);
  await openProject(page, "Uno");
});

test("an expired link asks for a new one; the requester never sees other requests", async ({ page }) => {
  await signIn(page, beto, { path: "/?accessProject=uno&accessLink=" + "f".repeat(32) });
  await expect(page.locator(".accessRequestDialog")).toContainText("no existe");
  await expect(page.getByRole("button", { name: "Solicitar acceso" })).toHaveCount(0);
});

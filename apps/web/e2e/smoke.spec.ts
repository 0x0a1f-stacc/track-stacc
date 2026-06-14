import { test, expect } from "@playwright/test";

test("smoke test - renders landing page title", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("Stack a room. Pass the aux.");
});

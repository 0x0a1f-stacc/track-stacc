import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "line",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "pnpm --filter api dev",
      url: "http://localhost:4000/health",
      reuseExistingServer: true,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "pnpm --filter web dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});

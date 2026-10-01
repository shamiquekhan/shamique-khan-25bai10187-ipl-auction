import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "../tests/ui",
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    channel: "chrome", // use installed Chrome; no browser download needed
    baseURL: process.env.AUCTION_BASE ?? "http://localhost:3000",
  },
});

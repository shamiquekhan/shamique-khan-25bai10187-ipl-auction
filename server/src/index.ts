import path from "node:path";
import { existsSync } from "node:fs";
import express from "express";

import { config } from "./config.js";
import { openDb } from "./db.js";
import { getState, setState, logEvent, getSettings } from "./state.js";
import { createAppServer } from "./app.js";
import { clearTimer } from "./engine/timer.js";
import { runSeed } from "./seed/seed.js";

const db = openDb(config.dbPath);

// Seed on first boot if the DB is empty (used on ephemeral hosts like Render).
if (config.seedOnEmpty) {
  const n = (db.prepare("SELECT COUNT(*) AS n FROM teams").get() as { n: number }).n;
  if (n === 0) {
    const csvPath = path.resolve(config.passcodesCsv);
    const { teams } = runSeed(db, { csvPath });
    console.log(`Seeded ${teams.length} teams (passcodes written to ${csvPath})`);
  }
}

// Boot recovery: a lot LIVE at startup becomes PAUSED with a safe remaining
// time — the auctioneer consciously resumes it. Never silently re-arm.
{
  const st = getState(db);
  if (st.phase === "LIVE") {
    const safeRemaining = getSettings(db).bidResetSeconds * 1000;
    setState(db, { phase: "PAUSED", pausedRemainingMs: safeRemaining, deadlineAt: null });
    logEvent(db, "BOOT_RECOVERY", { from: "LIVE", note: "lot paused after server restart" });
    console.warn("Boot recovery: LIVE lot moved to PAUSED (resume to continue).");
  }
}

const { app, server } = createAppServer(db, config.adminPassword);

// Serve the built web app with an SPA fallback for /board, /team, /admin…
const webDist = path.resolve(import.meta.dirname, "../../web/dist");
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(webDist, "index.html"));
  });
} else {
  app.get("/", (_req: express.Request, res: express.Response) => {
    res
      .type("html")
      .send(
        "<h1>Auction server is running</h1><p>Build the web app first: <code>npm run build</code></p>"
      );
  });
}

server.listen(config.port, () => {
  console.log(`Auction server on http://0.0.0.0:${config.port} (db: ${config.dbPath})`);
});

const shutdown = () => {
  clearTimer();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

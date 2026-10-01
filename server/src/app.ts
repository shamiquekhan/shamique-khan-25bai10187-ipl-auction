import http from "node:http";
import express from "express";
import helmet from "helmet";
import { Server } from "socket.io";
import type { DB } from "./db.js";
import { makeRouter } from "./http.js";
import { wireSocketEvents } from "./socket.js";

/**
 * Builds the HTTP + WebSocket server on the given database.
 * index.ts adds static hosting on top; tests reuse this to boot the real stack.
 */
export function createAppServer(db: DB, adminPassword: string): {
  app: express.Express;
  server: http.Server;
  io: Server;
} {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false })); // relaxed CSP for the Vite build
  app.use(express.json());
  app.use("/api", makeRouter(db, adminPassword));

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: true } });
  wireSocketEvents(io, db);

  return { app, server, io };
}

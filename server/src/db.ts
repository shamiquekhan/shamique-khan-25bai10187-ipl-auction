import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Opens the SQLite database, applies pragmas and runs the schema.
 * Pass ":memory:" (the default here) for tests.
 */
export function openDb(dbPath = ":memory:"): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  const schemaPath = path.join(import.meta.dirname, "schema.sql");
  db.exec(readFileSync(schemaPath, "utf8"));

  return db;
}

export type DB = Database.Database;

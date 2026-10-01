import { randomBytes, scryptSync, randomInt } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DB } from "../db.js";
import { updateSettings, getSettings } from "../state.js";
import { DEFAULT_SETTINGS } from "@auction/shared";

interface TeamSeed {
  code: string;
  name: string;
  color: string;
}
interface PlayerSeed {
  name: string;
  role: string;
  nationality?: string;
  basePrice: number;
  setNo: number;
}

/** 6-char unambiguous alphabet (no 0/O/1/I) — printed once, handed to teams. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const genPasscode = (): string =>
  Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** scrypt with a per-passcode salt; stored as "salt:hash" (hex). */
export const hashPasscode = (plain: string): string => {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
};

function readSeedFile(name: string): string {
  return readFileSync(path.join(import.meta.dirname, name), "utf8");
}

export function runSeed(
  db: DB,
  opts: { csvPath?: string } = {}
): { teams: { code: string; passcode: string }[] } {
  const teamsSeed = (JSON.parse(readSeedFile("teams.json")) as TeamSeed[]).slice(0, 15);
  const playersSeed = JSON.parse(readSeedFile("players.json")) as PlayerSeed[];
  const cfg = DEFAULT_SETTINGS;

  // Passcodes are generated outside the tx so the caller can report them.
  const passcodes: { code: string; passcode: string }[] = teamsSeed.map((t) => ({
    code: t.code,
    passcode: genPasscode(),
  }));

  const seedTx = db.transaction(() => {
    const insertTeam = db.prepare(
      "INSERT OR IGNORE INTO teams (code, name, color, passcode_hash, purse) VALUES (?, ?, ?, ?, ?)"
    );
    const insertPlayer = db.prepare(
      "INSERT INTO players (name, role, nationality, base_price, set_no, queue_pos, status) VALUES (?, ?, ?, ?, ?, ?, 'PENDING')"
    );

    teamsSeed.forEach((t, i) => {
      insertTeam.run(t.code, t.name, t.color, hashPasscode(passcodes[i].passcode), cfg.startingPurse);
    });

    // Shuffle within each set so the queue order is not alphabetical.
    const bySet = new Map<number, PlayerSeed[]>();
    for (const p of playersSeed) {
      if (!bySet.has(p.setNo)) bySet.set(p.setNo, []);
      bySet.get(p.setNo)!.push(p);
    }
    for (const [setNo, players] of [...bySet.entries()].sort((a, b) => a[0] - b[0])) {
      const shuffled = [...players];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      shuffled.forEach((p, idx) => {
        insertPlayer.run(p.name, p.role, p.nationality ?? null, p.basePrice, setNo, idx + 1);
      });
    }

    updateSettings(db, cfg);
  });
  seedTx.immediate();

  if (opts.csvPath) {
    const names = new Map(
      (db.prepare("SELECT code, name FROM teams").all() as { code: string; name: string }[]).map(
        (t) => [t.code, t.name]
      )
    );
    const rows = ["team_code,team_name,passcode"];
    for (const { code, passcode } of passcodes) {
      rows.push(`${code},${(names.get(code) ?? code).replace(/,/g, " ")},${passcode}`);
    }
    writeFileSync(opts.csvPath, rows.join("\n") + "\n");
  }

  return { teams: passcodes };
}

// Allow running directly: `npm run seed` → tsx server/src/seed/seed.ts
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  (async () => {
    const { openDb } = await import("../db.js");
    const { config } = await import("../config.js");
    const db = openDb(config.dbPath);
    const csvPath = path.resolve("passcodes.csv");
    const { teams } = runSeed(db, { csvPath });
    void getSettings(db);
    console.log(`Seeded ${teams.length} teams → passcodes written to ${csvPath}`);
    console.log(teams.map((t) => `${t.code}: ${t.passcode}`).join("\n"));
  })();
}

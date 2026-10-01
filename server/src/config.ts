import { z } from "zod";
import "dotenv/config";

const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  ADMIN_PASSWORD: z.string().min(1).default("admin123"),
  DB_PATH: z.string().default("./auction.db"),
  SEED_ON_EMPTY: z
    .string()
    .default("false")
    .transform((v) => v === "true" || v === "1"),
  PASSCODES_CSV: z.string().default("./passcodes.csv"),
});

const env = Env.parse(process.env);

export const config = {
  port: env.PORT,
  adminPassword: env.ADMIN_PASSWORD,
  dbPath: env.DB_PATH,
  seedOnEmpty: env.SEED_ON_EMPTY,
  passcodesCsv: env.PASSCODES_CSV,
};
export type Config = typeof config;

import { config } from "dotenv";
import { resolve } from "node:path";

/**
 * Loads `.env` from the repository root (current working directory).
 * Does not override variables already set in the environment (e.g. CI secrets).
 * @param {string} [cwd]
 */
export function loadRailwayDotenv(cwd = process.cwd()) {
  return config({ path: resolve(cwd, ".env"), quiet: true });
}

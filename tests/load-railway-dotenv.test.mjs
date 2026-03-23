import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadRailwayDotenv } from "../scripts/load-railway-dotenv.mjs";

test("loadRailwayDotenv reads RAILWAY_TOKEN from .env without overriding existing env", () => {
  const dir = mkdtempSync(join(tmpdir(), "railway-dotenv-"));
  try {
    writeFileSync(join(dir, ".env"), "RAILWAY_TOKEN=from-dotenv-file\nOTHER=x\n");
    delete process.env.RAILWAY_TOKEN;
    delete process.env.OTHER;
    loadRailwayDotenv(dir);
    assert.equal(process.env.RAILWAY_TOKEN, "from-dotenv-file");
    assert.equal(process.env.OTHER, "x");
    process.env.RAILWAY_TOKEN = "preset";
    loadRailwayDotenv(dir);
    assert.equal(process.env.RAILWAY_TOKEN, "preset");
  } finally {
    rmSync(dir, { recursive: true });
    delete process.env.RAILWAY_TOKEN;
    delete process.env.OTHER;
  }
});

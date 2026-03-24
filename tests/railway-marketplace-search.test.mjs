import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeForMatch,
  resolveQueryAlias,
  scoreTemplate,
  topMatches,
} from "../scripts/lib/railway-marketplace-search.mjs";

test("normalizeForMatch strips punctuation and lowercases", () => {
  assert.equal(normalizeForMatch("  Cal.com! "), "cal com");
});

test("resolveQueryAlias maps N8N to n8n", () => {
  assert.equal(resolveQueryAlias("N8N"), "n8n");
});

test("scoreTemplate prefers exact name match", () => {
  const hi = scoreTemplate("Redis", { name: "Redis", code: "redis", description: "cache" });
  const lo = scoreTemplate("Redis", { name: "Redash", code: "redash", description: "dashboards" });
  assert.ok(hi > lo);
});

test("topMatches returns sorted top scores", () => {
  const templates = [
    { id: "1", name: "PostgreSQL", code: "postgresql", description: "db" },
    { id: "2", name: "PostgreSQL 16", code: "postgresql-16", description: "db" },
    { id: "3", name: "Redash", code: "redash", description: "not postgres" },
  ];
  const { matches } = topMatches(templates, "PostgreSQL", 2);
  assert.equal(matches.length, 2);
  assert.ok(matches[0].score >= matches[1].score);
  assert.equal(matches[0].template.name, "PostgreSQL");
});

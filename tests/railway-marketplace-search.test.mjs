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

test("resolveQueryAlias maps Calcom to Cal.com", () => {
  assert.equal(resolveQueryAlias("Calcom"), "Cal.com");
});

test("resolveQueryAlias fixes Wordpress prefix to WordPress", () => {
  assert.equal(resolveQueryAlias("Wordpress With Mysql"), "WordPress With Mysql");
});

test("scoreTemplate prefers exact name match", () => {
  const hi = scoreTemplate("Redis", { name: "Redis", code: "redis", description: "cache" });
  const lo = scoreTemplate("Redis", { name: "Redash", code: "redash", description: "dashboards" });
  assert.ok(hi > lo);
});

test("scoreTemplate boosts when code matches compact query", () => {
  const tpl = { name: "Other", code: "postgresql", description: "db" };
  const withCode = scoreTemplate("PostgreSQL", { ...tpl, code: "postgresql" });
  const without = scoreTemplate("PostgreSQL", { ...tpl, code: "other" });
  assert.ok(withCode > without);
});

test("scoreTemplate boosts when code matches hyphenated query form", () => {
  const s = scoreTemplate("foo bar", {
    name: "x",
    code: "foo-bar",
    description: "",
  });
  assert.ok(s >= 800_000);
});

test("scoreTemplate uses both alias and raw query when they differ", () => {
  const tpl = { name: "Cal.com", code: "calcom", description: "scheduling" };
  const s = scoreTemplate("Calcom", tpl);
  assert.ok(s > 0);
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

test("topMatches returns empty matches for empty template list", () => {
  const { matches, resolvedQuery } = topMatches([], "Redis", 5);
  assert.equal(matches.length, 0);
  assert.equal(resolvedQuery, "Redis");
});

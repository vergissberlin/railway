import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const SCRIPT_PATH = path.resolve("scripts/sync-template-registry.mjs");
const REGISTRY = "docs/railway-templates-registry.json";

const ALPHA_BADGE = { label: "Alpha", color: "AABBCC", logo: "alpha" };
const BETA_BADGE = { label: "Beta", color: "112233", logo: "beta" };

/**
 * @param {{ checkedOut?: string[], badges?: object|null, badgeFor?: object }} [opts]
 */
function makeRoot(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "railway-registry-cli-"));
  const paths = ["railwayapp-alpha", "railwayapp-beta"];

  fs.writeFileSync(
    path.join(root, ".gitmodules"),
    paths
      .map((p) => `[submodule "${p}"]\n\tpath = ${p}\n\turl = git@github.com:vergissberlin/${p}.git\n`)
      .join("")
  );

  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  if (opts.badges !== null) {
    fs.writeFileSync(
      path.join(root, REGISTRY),
      JSON.stringify({ schemaVersion: 1, badges: opts.badges ?? {} }, null, 2)
    );
  }

  for (const p of opts.checkedOut ?? paths) {
    fs.mkdirSync(path.join(root, p), { recursive: true });
    const meta = {
      schemaVersion: 1,
      project: p,
      repo: `vergissberlin/${p}`,
      displayName: p === "railwayapp-alpha" ? "Alpha" : "Beta",
      publishedCode: p.replace("railwayapp-", ""),
      image: "https://example.com/a.svg",
      description: "Deploy this software on Railway with sensible defaults here.",
      workspaceAutomation: true,
    };
    // `badgeFor: { x: null }` must mean "explicitly no badge", so check for the key rather than
    // relying on ?? which would fall through to the default.
    const overridden =
      opts.badgeFor && Object.prototype.hasOwnProperty.call(opts.badgeFor, p);
    const badge = overridden
      ? opts.badgeFor[p]
      : p === "railwayapp-alpha"
        ? ALPHA_BADGE
        : BETA_BADGE;
    if (badge) meta.badge = badge;
    fs.writeFileSync(path.join(root, p, "railway-template.json"), JSON.stringify(meta, null, 2));
  }

  return { root, paths };
}

function readRegistry(root) {
  return JSON.parse(fs.readFileSync(path.join(root, REGISTRY), "utf8"));
}

function run(argv, opts = {}) {
  return execFileSync("node", [SCRIPT_PATH, ...argv], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

test("--help explains the dry-run default and --check", () => {
  const out = run(["--help"]);
  assert.match(out, /--apply/);
  assert.match(out, /--check/);
});

test("dry run reports what would change and writes nothing", () => {
  const { root } = makeRoot();
  const out = run(["--root", root]);
  assert.match(out, /Added: 2/);
  assert.match(out, /\[DRY\]/);
  assert.deepEqual(readRegistry(root).badges, {});
});

test("--apply caches the badges of the checked-out submodules", () => {
  const { root } = makeRoot();
  run(["--root", root, "--apply"]);
  const badges = readRegistry(root).badges;
  assert.deepEqual(badges["railwayapp-alpha"], ALPHA_BADGE);
  assert.deepEqual(badges["railwayapp-beta"], BETA_BADGE);
});

test("a changed badge is detected and updated", () => {
  const { root } = makeRoot({ badges: { "railwayapp-alpha": { ...ALPHA_BADGE, color: "000000" } } });
  const out = run(["--root", root, "--apply"]);
  assert.match(out, /Changed: 1/);
  assert.equal(readRegistry(root).badges["railwayapp-alpha"].color, "AABBCC");
});

test("entries of absent submodules are preserved, never deleted", () => {
  const { root } = makeRoot({
    checkedOut: ["railwayapp-alpha"],
    badges: { "railwayapp-beta": BETA_BADGE },
  });
  run(["--root", root, "--apply"]);
  const badges = readRegistry(root).badges;
  assert.deepEqual(
    badges["railwayapp-beta"],
    BETA_BADGE,
    "not on disk means unknown, not removed"
  );
  assert.deepEqual(badges["railwayapp-alpha"], ALPHA_BADGE);
});

test("a checked-out template without badge metadata keeps its cached entry", () => {
  const { root } = makeRoot({
    badgeFor: { "railwayapp-alpha": null },
    badges: { "railwayapp-alpha": ALPHA_BADGE },
  });
  const out = run(["--root", root, "--apply"]);
  assert.match(out, /no badge block in railway-template\.json/);
  assert.deepEqual(readRegistry(root).badges["railwayapp-alpha"], ALPHA_BADGE);
});

test("templates with no badge data anywhere are reported as blocking the footer", () => {
  const { root } = makeRoot({ checkedOut: [], badges: {} });
  const out = run(["--root", root]);
  assert.match(out, /the footer cannot be built/);
  assert.match(out, /Missing badge data: 2/);
});

test("--check passes on a synced registry", () => {
  const { root } = makeRoot();
  run(["--root", root, "--apply"]);
  assert.match(run(["--root", root, "--check"]), /completed/);
});

test("--check fails on a stale registry and names the fix", () => {
  const { root } = makeRoot();
  const result = spawnSync("node", [SCRIPT_PATH, "--root", root, "--check"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /templates:registry:sync:apply/);
});

test("--check fails when a submodule has no badge data at all", () => {
  const { root } = makeRoot({ checkedOut: [], badges: { "railwayapp-alpha": ALPHA_BADGE } });
  const result = spawnSync("node", [SCRIPT_PATH, "--root", root, "--check"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /out of date/);
});

test("a missing registry file is treated as empty", () => {
  const { root } = makeRoot({ badges: null });
  const out = run(["--root", root]);
  assert.match(out, /Added: 2/);
});

test("an invalid badge colour fails with the offending value", () => {
  const { root } = makeRoot({ badgeFor: { "railwayapp-alpha": { ...ALPHA_BADGE, color: "nope" } } });
  const result = spawnSync("node", [SCRIPT_PATH, "--root", root], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /badge\.color must be a 6-digit hex/);
});

test("unknown arguments are rejected and `--` is ignored", () => {
  const { root } = makeRoot();
  assert.match(run(["--", "--root", root]), /Added: 2/);

  const result = spawnSync("node", [SCRIPT_PATH, "--nope"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Unknown argument: --nope/);
});

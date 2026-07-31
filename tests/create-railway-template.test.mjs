import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const SCRIPT_PATH = path.resolve("scripts/create-railway-template.mjs");

const SPEC = {
  displayName: "Uptime Kuma",
  slug: "uptime-kuma",
  description: "Deploy Uptime Kuma on Railway for self-hosted uptime monitoring.",
  upstreamImage: "louislam/uptime-kuma",
  versionTag: "1.23",
  port: 3001,
  healthcheckPath: "/",
  mountPath: "/app/data",
};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "railway-create-test-"));
}

function writeSpec(dir, overrides = {}) {
  const file = path.join(dir, "spec.json");
  fs.writeFileSync(file, JSON.stringify({ ...SPEC, ...overrides }, null, 2));
  return file;
}

function run(argv, opts = {}) {
  return execFileSync("node", [SCRIPT_PATH, ...argv], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

test("--help documents the dry-run default", () => {
  const out = run(["--help"]);
  assert.match(out, /--apply/);
  assert.match(out, /dry run/);
});

test("dry run lists the files and writes nothing", () => {
  const dir = tempDir();
  const out = run(["--spec", writeSpec(dir), "--out", path.join(dir, "target")]);
  assert.match(out, /README\.md/);
  assert.match(out, /dry run/);
  assert.ok(!fs.existsSync(path.join(dir, "target")), "a dry run must not create the target");
});

test("--apply writes the repository and marks the entrypoint executable", () => {
  const dir = tempDir();
  const target = path.join(dir, "target");
  run([
    "--spec",
    writeSpec(dir, {
      portStrategy: "entrypoint",
      portEnvVar: "UPTIME_KUMA_BIND",
      upstreamEntrypoint: "/entrypoint.sh",
    }),
    "--out",
    target,
    "--apply",
  ]);

  assert.ok(fs.existsSync(path.join(target, "README.md")));
  assert.ok(fs.existsSync(path.join(target, ".github/workflows/release-please.yml")));
  assert.ok(!fs.existsSync(path.join(target, ".env")), ".env must never be scaffolded");
  const mode = fs.statSync(path.join(target, "railway-entrypoint.sh")).mode;
  assert.ok(mode & 0o111, "railway-entrypoint.sh must be executable");
});

test("flags override --spec values", () => {
  const dir = tempDir();
  const target = path.join(dir, "target");
  run(["--spec", writeSpec(dir), "--display-name", "Kuma", "--out", target, "--apply"]);
  assert.match(fs.readFileSync(path.join(target, "README.md"), "utf8"), /^# Kuma for railway\.app/);
});

test("a full spec can be given as flags only, and `--` is ignored", () => {
  const dir = tempDir();
  const target = path.join(dir, "target");
  run([
    "--",
    "--display-name",
    "Plausible",
    "--slug",
    "plausible",
    "--description",
    "Deploy Plausible on Railway for privacy friendly web analytics.",
    "--upstream-image",
    "plausible/analytics",
    "--tag",
    "v2.1",
    "--port",
    "8000",
    "--healthcheck",
    "/api/health",
    "--mount",
    "/var/lib/plausible",
    "--env",
    "SECRET_KEY_BASE=changeme",
    "--feature",
    "Privacy friendly analytics",
    "--badge-label",
    "Plausible",
    "--badge-color",
    "#5850EC",
    "--badge-logo",
    "plausibleanalytics",
    "--out",
    target,
    "--apply",
  ]);

  const meta = JSON.parse(fs.readFileSync(path.join(target, "railway-template.json"), "utf8"));
  assert.equal(meta.displayName, "Plausible");
  assert.deepEqual(meta.badge, {
    label: "Plausible",
    color: "5850EC",
    logo: "plausibleanalytics",
  });
  assert.match(fs.readFileSync(path.join(target, ".env.example"), "utf8"), /SECRET_KEY_BASE/);
});

test("a logo is copied in and inlined into the banner", () => {
  const dir = tempDir();
  const target = path.join(dir, "target");
  const logo = path.join(dir, "kuma.svg");
  fs.writeFileSync(logo, "<svg xmlns='http://www.w3.org/2000/svg'></svg>");

  run(["--spec", writeSpec(dir), "--out", target, "--logo", logo, "--apply"]);

  assert.ok(fs.existsSync(path.join(target, "logo-uptime-kuma.svg")));
  const svg = fs.readFileSync(path.join(target, "template-header.svg"), "utf8");
  assert.match(svg, /data:image\/svg\+xml;base64,/);
  const meta = JSON.parse(fs.readFileSync(path.join(target, "railway-template.json"), "utf8"));
  assert.equal(meta.logoFile, "logo-uptime-kuma.svg");
});

test("a logo replaces a previously requested custom icon", () => {
  const dir = tempDir();
  const target = path.join(dir, "target");
  const logo = path.join(dir, "kuma.png");
  fs.writeFileSync(logo, "png");
  run([
    "--spec",
    writeSpec(dir, { customIcon: "redis" }),
    "--out",
    target,
    "--logo",
    logo,
    "--apply",
  ]);
  const meta = JSON.parse(fs.readFileSync(path.join(target, "railway-template.json"), "utf8"));
  assert.equal(meta.logoFile, "logo-uptime-kuma.png");
  assert.ok(!("customIcon" in meta), "a real logo makes the fallback icon meaningless");
});

test("an unsupported or missing logo path fails before anything is written", () => {
  const dir = tempDir();
  const specFile = writeSpec(dir);

  const wrongExt = spawnSync("node", [SCRIPT_PATH, "--spec", specFile, "--logo", "x.gif"], {
    encoding: "utf8",
  });
  assert.notEqual(wrongExt.status, 0);
  assert.match(wrongExt.stderr + wrongExt.stdout, /must be an \.svg or \.png/);

  const missing = spawnSync(
    "node",
    [SCRIPT_PATH, "--spec", specFile, "--logo", path.join(dir, "nope.png")],
    { encoding: "utf8" }
  );
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr + missing.stdout, /Logo file not found/);
});

test("an existing non-empty target is refused unless --force is given", () => {
  const dir = tempDir();
  const target = path.join(dir, "target");
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "keep.txt"), "existing work");

  const refused = spawnSync(
    "node",
    [SCRIPT_PATH, "--spec", writeSpec(dir), "--out", target, "--apply"],
    { encoding: "utf8" }
  );
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr + refused.stdout, /not empty/);
  assert.ok(fs.existsSync(path.join(target, "keep.txt")));

  run(["--spec", writeSpec(dir), "--out", target, "--apply", "--force"]);
  assert.ok(fs.existsSync(path.join(target, "README.md")));
});

test("the default target is <root>/railwayapp-<slug>", () => {
  const dir = tempDir();
  const out = run(["--spec", writeSpec(dir), "--root", dir]);
  assert.match(out, new RegExp(path.join(dir, "railwayapp-uptime-kuma").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("an invalid spec exits non-zero with an actionable message", () => {
  const dir = tempDir();
  const result = spawnSync(
    "node",
    [SCRIPT_PATH, "--spec", writeSpec(dir, { description: "too short" })],
    { encoding: "utf8" }
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /between 25 and 75/);
});

test("unknown arguments and malformed --env are rejected", () => {
  const bad = spawnSync("node", [SCRIPT_PATH, "--nope"], { encoding: "utf8" });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr + bad.stdout, /Unknown argument: --nope/);

  const dir = tempDir();
  const env = spawnSync(
    "node",
    [SCRIPT_PATH, "--spec", writeSpec(dir), "--env", "NOEQUALS"],
    { encoding: "utf8" }
  );
  assert.notEqual(env.status, 0);
  assert.match(env.stderr + env.stdout, /--env expects KEY=VALUE/);
});

test("--spec without a path is rejected", () => {
  const result = spawnSync("node", [SCRIPT_PATH, "--spec"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /--spec requires a file path/);
});

test("the deploy code placeholder is surfaced as a follow-up", () => {
  const dir = tempDir();
  const out = run(["--spec", writeSpec(dir), "--out", path.join(dir, "t")]);
  assert.match(out, /REPLACE_WITH_RAILWAY_TEMPLATE_CODE/);
});

test("scaffolding without a logo says which file to add", () => {
  const dir = tempDir();
  const out = run(["--spec", writeSpec(dir), "--out", path.join(dir, "t")]);
  assert.match(out, /logo-uptime-kuma\.png/);
});

test("a large inlined logo produces a size warning", () => {
  const dir = tempDir();
  const logo = path.join(dir, "big.png");
  fs.writeFileSync(logo, Buffer.alloc(40_000, 1));
  const out = run(["--spec", writeSpec(dir), "--out", path.join(dir, "t"), "--logo", logo, "--apply"]);
  assert.match(out, /at most 256px/);
});

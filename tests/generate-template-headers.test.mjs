import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const SCRIPT_PATH = path.resolve("scripts/generate-template-headers.mjs");
const BANNER = "template-header.svg";

/**
 * @param {{ withLogo?: boolean, readme?: string, extra?: object }} [opts]
 */
function makeRoot(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "railway-headers-test-"));
  const repo = path.join(root, "railwayapp-alpha");
  fs.mkdirSync(repo, { recursive: true });

  const meta = {
    schemaVersion: 1,
    project: "railwayapp-alpha",
    repo: "vergissberlin/railwayapp-alpha",
    displayName: "Alpha",
    publishedCode: "alpha",
    image: "https://example.com/a.svg",
    description: "Deploy Alpha software on Railway with sensible defaults here.",
    workspaceAutomation: true,
    ...opts.extra,
  };
  if (opts.withLogo) {
    meta.logoFile = "logo-alpha.png";
    fs.writeFileSync(path.join(repo, "logo-alpha.png"), "png-bytes");
  }
  fs.writeFileSync(path.join(repo, "railway-template.json"), JSON.stringify(meta, null, 2));
  if (opts.readme !== null) {
    fs.writeFileSync(path.join(repo, "README.md"), opts.readme ?? "# Alpha for railway.app\n\nBody\n");
  }
  return { root, repo };
}

function run(argv, opts = {}) {
  return execFileSync("node", [SCRIPT_PATH, ...argv], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

test("--help mentions that metadata drives the generator", () => {
  const out = run(["--help"]);
  assert.match(out, /railway-template\.json/);
  assert.match(out, /--only/);
});

test("generates the banner and references it below the H1", () => {
  const { root, repo } = makeRoot();
  run(["--root", root]);

  const svg = fs.readFileSync(path.join(repo, BANNER), "utf8");
  assert.match(svg, /Alpha header banner/);
  const readme = fs.readFileSync(path.join(repo, "README.md"), "utf8").split("\n");
  assert.equal(readme[0], "# Alpha for railway.app");
  assert.equal(readme[2], `![Template Header](./${BANNER})`);
});

test("inlines a declared logo", () => {
  const { root, repo } = makeRoot({ withLogo: true });
  run(["--root", root]);
  assert.match(fs.readFileSync(path.join(repo, BANNER), "utf8"), /data:image\/png;base64,/);
});

test("a second run is a no-op", () => {
  const { root } = makeRoot();
  run(["--root", root]);
  const out = run(["--root", root]);
  assert.match(out, /Unchanged: 1/);
  assert.match(out, /Updated: 0/);
});

test("--dry-run reports the change without writing", () => {
  const { root, repo } = makeRoot();
  const out = run(["--root", root, "--dry-run"]);
  assert.match(out, /\[DRY\]/);
  assert.ok(!fs.existsSync(path.join(repo, BANNER)));
});

test("warns about a declared but missing logo and still writes a banner", () => {
  const { root, repo } = makeRoot({ extra: { logoFile: "gone.png" } });
  const out = run(["--root", root]);
  assert.match(out, /Missing logo file/);
  assert.ok(fs.existsSync(path.join(repo, BANNER)));
});

test("warns about an unknown customIcon", () => {
  const { root } = makeRoot({ extra: { customIcon: "not-real" } });
  assert.match(run(["--root", root]), /Unknown customIcon/);
});

test("skips a template without a README", () => {
  const { root } = makeRoot({ readme: null });
  const out = run(["--root", root]);
  assert.match(out, /Missing README/);
  assert.match(out, /Skipped \(missing README\): 1/);
});

test("--only limits the run and fails clearly on an unknown folder", () => {
  const { root } = makeRoot();
  assert.match(run(["--root", root, "--only", "railwayapp-alpha"]), /Updated: 1/);

  const result = spawnSync("node", [SCRIPT_PATH, "--root", root, "--only", "railwayapp-nope"], {
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /No railway-template\.json found for railwayapp-nope/);
});

test("an empty checkout warns with the submodule hint instead of failing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "railway-headers-empty-"));
  const out = run(["--root", root]);
  assert.match(out, /git submodule update --init/);
});

test("unknown arguments are rejected and `--` is ignored", () => {
  const { root } = makeRoot();
  assert.match(run(["--", "--root", root, "--dry-run"]), /\[DRY\]/);

  const result = spawnSync("node", [SCRIPT_PATH, "--nope"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Unknown argument: --nope/);
});

test("invalid metadata surfaces as a non-zero exit", () => {
  const { root, repo } = makeRoot();
  fs.writeFileSync(
    path.join(repo, "railway-template.json"),
    JSON.stringify({ schemaVersion: 99 })
  );
  const result = spawnSync("node", [SCRIPT_PATH, "--root", root], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /schemaVersion/);
});

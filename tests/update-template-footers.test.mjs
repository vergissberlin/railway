import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const SCRIPT_PATH = path.resolve("scripts/update-template-footers.mjs");

const BADGES = {
  "railwayapp-alpha": { label: "Alpha", color: "AABBCC", logo: "alpha" },
  "railwayapp-beta": { label: "Beta", color: "112233", logo: "beta" },
};

/**
 * Builds a root with two submodules; `opts.badges` overrides the cached registry and
 * `opts.readmes` decides which submodules actually have a README on disk.
 */
function makeRoot(opts = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "railway-footers-test-"));
  const paths = ["railwayapp-alpha", "railwayapp-beta"];

  fs.writeFileSync(
    path.join(root, ".gitmodules"),
    paths
      .map((p) => `[submodule "${p}"]\n\tpath = ${p}\n\turl = git@github.com:vergissberlin/${p}.git\n`)
      .join("")
  );

  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs/railway-templates-registry.json"),
    JSON.stringify({ schemaVersion: 1, badges: opts.badges ?? BADGES }, null, 2)
  );

  for (const p of opts.readmes ?? paths) {
    fs.mkdirSync(path.join(root, p), { recursive: true });
    fs.writeFileSync(
      path.join(root, p, "README.md"),
      `# ${p}\n\nBody\n\n<!-- footer -->\nstale footer\n`
    );
  }
  return { root, paths };
}

function run(argv, opts = {}) {
  return execFileSync("node", [SCRIPT_PATH, ...argv], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

test("--help points at the registry as the badge source", () => {
  const out = run(["--help"]);
  assert.match(out, /railway-templates-registry\.json/);
});

test("writes the badge footer into every checked-out README exactly once", () => {
  const { root } = makeRoot();
  run(["--root", root]);

  const readme = fs.readFileSync(path.join(root, "railwayapp-alpha/README.md"), "utf8");
  assert.equal(readme.match(/<!-- footer -->/g).length, 1, "the marker must not be duplicated");
  assert.match(readme, /img\.shields\.io\/badge\/Alpha-AABBCC/);
  assert.match(readme, /img\.shields\.io\/badge\/Beta-112233/);
  assert.ok(!readme.includes("stale footer"));
});

test("regenerates footer.md without the marker line", () => {
  const { root } = makeRoot();
  run(["--root", root]);
  const footer = fs.readFileSync(path.join(root, "footer.md"), "utf8");
  assert.ok(footer.startsWith("---\n\n"), "footer.md must not carry the marker itself");
  assert.ok(!footer.includes("<!-- footer -->"));
});

test("badges follow alphabetical submodule order", () => {
  const { root } = makeRoot();
  run(["--root", root]);
  const footer = fs.readFileSync(path.join(root, "footer.md"), "utf8");
  assert.ok(footer.indexOf("railwayapp-alpha") < footer.indexOf("railwayapp-beta"));
});

test("a second run changes nothing", () => {
  const { root } = makeRoot();
  run(["--root", root]);
  const out = run(["--root", root]);
  assert.match(out, /Unchanged: 2/);
  assert.match(out, /Updated: 0/);
});

test("--dry-run reports without writing", () => {
  const { root } = makeRoot();
  const out = run(["--root", root, "--dry-run"]);
  assert.match(out, /\[DRY\]/);
  assert.ok(!fs.existsSync(path.join(root, "footer.md")));
  assert.match(fs.readFileSync(path.join(root, "railwayapp-alpha/README.md"), "utf8"), /stale footer/);
});

test("a partial checkout is warned about, not fatal", () => {
  const { root } = makeRoot({ readmes: ["railwayapp-alpha"] });
  const out = run(["--root", root]);
  assert.match(out, /Missing README: railwayapp-beta/);
  assert.match(out, /Updated: 1/);
  assert.match(
    fs.readFileSync(path.join(root, "railwayapp-alpha/README.md"), "utf8"),
    /badge\/Beta-112233/,
    "the absent repo still gets a badge, because the registry knows it"
  );
});

test("a custom marker is honoured", () => {
  const { root } = makeRoot();
  fs.writeFileSync(
    path.join(root, "railwayapp-alpha/README.md"),
    "# Alpha\n\nBody\n\n<!-- links -->\nold\n"
  );
  run(["--root", root, "--marker", "<!-- links -->"]);
  assert.match(
    fs.readFileSync(path.join(root, "railwayapp-alpha/README.md"), "utf8"),
    /<!-- links -->\n---/
  );
});

test("missing badge data fails with the sync command in the message", () => {
  const { root } = makeRoot({ badges: { "railwayapp-alpha": BADGES["railwayapp-alpha"] } });
  const result = spawnSync("node", [SCRIPT_PATH, "--root", root], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  const output = result.stderr + result.stdout;
  assert.match(output, /Missing badge data for railwayapp-beta/);
  assert.match(output, /templates:registry:sync/);
});

test("a missing .gitmodules fails clearly", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "railway-footers-bare-"));
  const result = spawnSync("node", [SCRIPT_PATH, "--root", root], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Missing \.gitmodules/);
});

test("unknown arguments are rejected and `--` is ignored", () => {
  const { root } = makeRoot();
  assert.match(run(["--", "--root", root, "--dry-run"]), /\[DRY\]/);

  const result = spawnSync("node", [SCRIPT_PATH, "--nope"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Unknown argument: --nope/);
});

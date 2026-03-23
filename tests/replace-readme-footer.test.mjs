import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPT_PATH = path.resolve("scripts/replace-readme-footer.mjs");

function makeTempRepo() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "railway-footer-test-"));
  fs.writeFileSync(
    path.join(tmpRoot, ".gitmodules"),
    `[submodule "railwayapp-email"]
\tpath = railwayapp-email
\turl = git@github.com:vergissberlin/railwayapp-email.git
`,
    "utf8"
  );
  fs.mkdirSync(path.join(tmpRoot, "railwayapp-email"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpRoot, "railwayapp-email", "README.md"),
    `# Email Service

Body text.

<!-- footer -->
Old footer content
`,
    "utf8"
  );
  fs.writeFileSync(path.join(tmpRoot, "footer.md"), "New footer content\n", "utf8");
  return tmpRoot;
}

test("replace-readme-footer uses footer.md by default", () => {
  const tmpRoot = makeTempRepo();

  execFileSync("node", [SCRIPT_PATH], {
    cwd: tmpRoot,
    stdio: "pipe",
  });

  const updated = fs.readFileSync(
    path.join(tmpRoot, "railwayapp-email", "README.md"),
    "utf8"
  );
  assert.match(updated, /<!-- footer -->\nNew footer content\n$/);
});

test("replace-readme-footer accepts pnpm-style '-- --dry-run' forwarding", () => {
  const tmpRoot = makeTempRepo();
  const before = fs.readFileSync(
    path.join(tmpRoot, "railwayapp-email", "README.md"),
    "utf8"
  );

  execFileSync("node", [SCRIPT_PATH, "--", "--dry-run"], {
    cwd: tmpRoot,
    stdio: "pipe",
  });

  const after = fs.readFileSync(
    path.join(tmpRoot, "railwayapp-email", "README.md"),
    "utf8"
  );
  assert.equal(after, before);
});

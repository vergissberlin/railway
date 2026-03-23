import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const SCRIPT_PATH = path.resolve("scripts/sync-submodules-git.mjs");

function runGit(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
}

function setupWorkspace() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "railway-sync-test-"));
  const remotePath = path.join(tmpRoot, "remote.git");
  const seedPath = path.join(tmpRoot, "seed");
  const workspacePath = path.join(tmpRoot, "workspace");
  const submodulePath = path.join(workspacePath, "railwayapp-email");

  fs.mkdirSync(seedPath, { recursive: true });
  fs.mkdirSync(workspacePath, { recursive: true });

  runGit(tmpRoot, ["init", "--bare", remotePath]);
  runGit(tmpRoot, ["clone", remotePath, seedPath]);

  runGit(seedPath, ["config", "user.email", "test@example.com"]);
  runGit(seedPath, ["config", "user.name", "Test Bot"]);
  fs.writeFileSync(path.join(seedPath, "README.md"), "# Seed\n", "utf8");
  runGit(seedPath, ["add", "README.md"]);
  runGit(seedPath, ["commit", "-m", "chore: seed repository"]);
  runGit(seedPath, ["branch", "-M", "main"]);
  runGit(seedPath, ["push", "-u", "origin", "main"]);

  runGit(workspacePath, ["clone", remotePath, submodulePath]);
  runGit(submodulePath, ["config", "user.email", "test@example.com"]);
  runGit(submodulePath, ["config", "user.name", "Test Bot"]);
  runGit(submodulePath, ["checkout", "-B", "main"]);
  runGit(submodulePath, ["branch", "--set-upstream-to=origin/main", "main"]);

  fs.writeFileSync(
    path.join(workspacePath, ".gitmodules"),
    `[submodule "railwayapp-email"]
\tpath = railwayapp-email
\turl = ${remotePath}
`,
    "utf8"
  );

  return { workspacePath, submodulePath, remotePath };
}

test("sync-submodules dry-run keeps local changes untouched", () => {
  const { workspacePath, submodulePath } = setupWorkspace();
  const targetFile = path.join(submodulePath, "README.md");
  fs.appendFileSync(targetFile, "\nlocal change\n", "utf8");

  const beforeStatus = runGit(submodulePath, ["status", "--porcelain"]);
  assert.match(beforeStatus, /README\.md/);

  execFileSync("node", [SCRIPT_PATH, "--root", workspacePath, "--dry-run"], {
    cwd: workspacePath,
    stdio: "pipe",
  });

  const afterStatus = runGit(submodulePath, ["status", "--porcelain"]);
  assert.equal(afterStatus, beforeStatus);
});

test("sync-submodules live run commits and pushes dirty changes", () => {
  const { workspacePath, submodulePath, remotePath } = setupWorkspace();
  const commitMessage = "chore: sync template repos";
  const targetFile = path.join(submodulePath, "README.md");
  fs.appendFileSync(targetFile, "\nchanged via sync script\n", "utf8");

  execFileSync("node", [SCRIPT_PATH, "--root", workspacePath, "-m", commitMessage], {
    cwd: workspacePath,
    stdio: "pipe",
  });

  const status = runGit(submodulePath, ["status", "--porcelain"]);
  assert.equal(status, "");

  const lastLocalMessage = runGit(submodulePath, ["log", "-1", "--pretty=%s"]);
  assert.equal(lastLocalMessage, commitMessage);

  const lastRemoteMessage = runGit(tmpDirOf(remotePath), [
    "--git-dir",
    remotePath,
    "log",
    "-1",
    "--pretty=%s",
  ]);
  assert.equal(lastRemoteMessage, commitMessage);
});

test("sync-submodules fails on unknown argument", () => {
  const { workspacePath } = setupWorkspace();
  const result = spawnSync("node", [SCRIPT_PATH, "--root", workspacePath, "--unknown"], {
    cwd: workspacePath,
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /Unknown argument: --unknown/);
});

function tmpDirOf(filePath) {
  return path.dirname(filePath);
}

test("sync-submodules prints help", () => {
  const { workspacePath } = setupWorkspace();
  const out = execFileSync("node", [SCRIPT_PATH, "--help"], {
    cwd: workspacePath,
    stdio: "pipe",
    encoding: "utf8",
  });

  assert.match(out, /Usage:/);
  assert.match(out, /--no-rebase/);
});

test("sync-submodules can skip non-git listed submodule", () => {
  const { workspacePath } = setupWorkspace();
  fs.mkdirSync(path.join(workspacePath, "railwayapp-ghost"), { recursive: true });
  fs.writeFileSync(
    path.join(workspacePath, ".gitmodules"),
    `[submodule "railwayapp-email"]
\tpath = railwayapp-email
\turl = https://example.com/ok.git
[submodule "railwayapp-ghost"]
\tpath = railwayapp-ghost
\turl = https://example.com/ghost.git
`,
    "utf8"
  );

  const out = execFileSync("node", [SCRIPT_PATH, "--root", workspacePath, "--dry-run"], {
    cwd: workspacePath,
    stdio: "pipe",
    encoding: "utf8",
  });

  assert.match(out, /\[SKIP\] railwayapp-ghost/);
});

test("sync-submodules supports --no-rebase pull flow", () => {
  const { workspacePath, submodulePath } = setupWorkspace();
  fs.appendFileSync(path.join(submodulePath, "README.md"), "\nno-rebase run\n", "utf8");

  execFileSync("node", [SCRIPT_PATH, "--root", workspacePath, "--no-rebase"], {
    cwd: workspacePath,
    stdio: "pipe",
  });

  const status = runGit(submodulePath, ["status", "--porcelain"]);
  assert.equal(status, "");
});

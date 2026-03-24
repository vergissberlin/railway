import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";

import {
  executeSubmoduleSync,
  hasWorkingTreeChanges,
  parseSyncSubmodulesArgs,
  runGit,
  syncSubmodule,
} from "../scripts/sync-submodules-git-lib.mjs";

test("parseSyncSubmodulesArgs skips bare '--' so following flags apply", () => {
  const parsed = parseSyncSubmodulesArgs(["--", "--dry-run"]);
  assert.equal(parsed.kind, "args");
  assert.equal(parsed.args.dryRun, true);
});

test("parseSyncSubmodulesArgs returns help for -h", () => {
  const parsed = parseSyncSubmodulesArgs(["-h"]);
  assert.equal(parsed.kind, "help");
});

test("syncSubmodule records error when runGit fails after successful rev-parse", () => {
  const root = path.join(os.tmpdir(), "sync-lib-root");
  function mockRunGit(cwd, args) {
    if (args[0] === "rev-parse") return "true";
    if (args[0] === "status" && args[1] === "--porcelain") return "";
    if (args[0] === "pull") throw new Error("simulated pull failure");
    return "";
  }

  const result = syncSubmodule(root, "sub", { dryRun: false, rebase: true, message: "m" }, mockRunGit);
  assert.equal(result.skipped, false);
  assert.match(result.error, /simulated pull failure/);
});

test("executeSubmoduleSync throws when any submodule reports error", () => {
  assert.throws(
    () =>
      executeSubmoduleSync(
        "/tmp/root",
        [{ path: "a" }],
        { dryRun: false, rebase: true, message: "m" },
        () => ({
          submodulePath: "a",
          stashed: false,
          committed: false,
          pushed: false,
          skipped: false,
          error: "simulated failure",
        })
      ),
    /Submodule sync finished with 1 failure\(s\)/
  );
});

test("hasWorkingTreeChanges uses injected runGit", () => {
  const calls = [];
  function mockRunGit(cwd, args) {
    calls.push(args);
    if (args[0] === "status" && args[1] === "--porcelain") return " M file\n";
    return "";
  }
  assert.equal(hasWorkingTreeChanges("/any", mockRunGit), true);
  assert.equal(calls.length, 1);
});

test("runGit throws with message when git exits non-zero", () => {
  assert.throws(() => runGit(path.join(os.tmpdir(), "nonexistent-git-workdir-xyz"), ["status"]), /git status failed/);
});

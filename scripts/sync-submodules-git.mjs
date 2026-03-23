#!/usr/bin/env node

import path from "node:path";
import { spawnSync } from "node:child_process";
import { error, info, progress, success, summaryBox, warn } from "./misc-cli-utils.mjs";
import { getSubmodulesFromRoot } from "./template-cli-lib.mjs";

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    message: "chore: sync submodule changes",
    dryRun: false,
    rebase: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    } else if (arg === "--root") {
      args.root = argv[++i] || args.root;
    } else if (arg === "--message" || arg === "-m") {
      args.message = argv[++i] || args.message;
    } else if (arg === "--no-rebase") {
      args.rebase = false;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/sync-submodules-git.mjs [options]

Options:
  --root <path>          Root directory (default: current directory)
  -m, --message <text>   Commit message (default: "chore: sync submodule changes")
  --no-rebase            Use git pull without --rebase
  --dry-run              Print actions without changing git state
  -h, --help             Show this help
`);
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    const details = (result.stderr || result.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed${details ? `: ${details}` : ""}`);
  }

  return (result.stdout || "").trim();
}

function hasWorkingTreeChanges(cwd) {
  return runGit(cwd, ["status", "--porcelain"]).length > 0;
}

function syncSubmodule(rootPath, submodulePath, opts) {
  const repoPath = path.join(rootPath, submodulePath);
  const result = {
    submodulePath,
    stashed: false,
    committed: false,
    pushed: false,
    skipped: false,
    error: null,
  };

  try {
    runGit(repoPath, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    result.skipped = true;
    return result;
  }

  try {
    const hadChanges = hasWorkingTreeChanges(repoPath);

    if (hadChanges) {
      result.stashed = true;
      if (!opts.dryRun) {
        runGit(repoPath, ["stash", "push", "-u", "-m", "auto-sync-submodule"]);
      }
    }

    if (!opts.dryRun) {
      runGit(repoPath, opts.rebase ? ["pull", "--rebase"] : ["pull"]);
    }

    if (result.stashed && !opts.dryRun) {
      runGit(repoPath, ["stash", "pop"]);
    }

    if (!opts.dryRun && hasWorkingTreeChanges(repoPath)) {
      runGit(repoPath, ["add", "-A"]);
      runGit(repoPath, ["commit", "-m", opts.message]);
      result.committed = true;
    }

    if (!opts.dryRun) {
      runGit(repoPath, ["push"]);
      result.pushed = true;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootPath = path.resolve(args.root);
  const submodules = getSubmodulesFromRoot(rootPath);

  info(`Syncing ${submodules.length} submodules with stash/pull/pop/commit/push`);
  if (args.dryRun) {
    warn("Dry run enabled, no git changes will be executed");
  }

  let ok = 0;
  let failed = 0;
  let skipped = 0;
  let committed = 0;
  let stashed = 0;

  for (const submodule of submodules) {
    const result = syncSubmodule(rootPath, submodule.path, args);

    if (result.skipped) {
      skipped += 1;
      progress("[SKIP]", submodule.path, "not a git worktree", "yellow");
      continue;
    }

    if (result.error) {
      failed += 1;
      progress("[FAIL]", submodule.path, result.error, "red");
      continue;
    }

    ok += 1;
    if (result.stashed) stashed += 1;
    if (result.committed) committed += 1;
    progress(
      args.dryRun ? "[DRY]" : "[OK]",
      submodule.path,
      args.dryRun
        ? result.stashed
          ? "would stash + pull + pop + commit + push"
          : "would pull + push"
        : result.committed
          ? "synced + committed + pushed"
          : "synced + pushed",
      args.dryRun ? "yellow" : "green"
    );
  }

  summaryBox("Submodule Git Sync Summary", [
    `Successful: ${ok}`,
    `Failed: ${failed}`,
    `Skipped: ${skipped}`,
    `Stashed: ${stashed}`,
    `Committed: ${committed}`,
    `Mode: ${args.dryRun ? "dry-run" : "live"}`,
  ]);

  if (failed > 0) {
    throw new Error(`Submodule sync finished with ${failed} failure(s)`);
  }

  success("Submodule sync completed");
}

try {
  main();
} catch (err) {
  error(err.message);
  process.exit(1);
}

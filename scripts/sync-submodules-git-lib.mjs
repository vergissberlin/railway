import path from "node:path";
import { spawnSync } from "node:child_process";
import { info, progress, success, summaryBox, warn } from "./misc-cli-utils.mjs";
import { getSubmodulesFromRoot } from "./template-cli-lib.mjs";

/**
 * @param {string[]} argv
 * @returns {{ kind: "help" } | { kind: "args", args: { root: string, message: string, dryRun: boolean, rebase: boolean } }}
 */
export function parseSyncSubmodulesArgs(argv) {
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
      return { kind: "help" };
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { kind: "args", args };
}

export function printHelp() {
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

/**
 * @param {string} cwd
 * @param {string[]} args
 * @returns {string}
 */
export function runGit(cwd, args) {
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

/**
 * @param {string} cwd
 * @param {(cwd: string, args: string[]) => string} runGitImpl
 */
export function hasWorkingTreeChanges(cwd, runGitImpl = runGit) {
  return runGitImpl(cwd, ["status", "--porcelain"]).length > 0;
}

/**
 * @param {string} rootPath
 * @param {string} submodulePath
 * @param {{ dryRun: boolean, rebase: boolean, message: string }} opts
 * @param {(cwd: string, args: string[]) => string} [runGitImpl]
 */
export function syncSubmodule(rootPath, submodulePath, opts, runGitImpl = runGit) {
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
    runGitImpl(repoPath, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    result.skipped = true;
    return result;
  }

  try {
    const hadChanges = hasWorkingTreeChanges(repoPath, runGitImpl);

    if (hadChanges) {
      result.stashed = true;
      if (!opts.dryRun) {
        runGitImpl(repoPath, ["stash", "push", "-u", "-m", "auto-sync-submodule"]);
      }
    }

    if (!opts.dryRun) {
      runGitImpl(repoPath, opts.rebase ? ["pull", "--rebase"] : ["pull"]);
    }

    if (result.stashed && !opts.dryRun) {
      runGitImpl(repoPath, ["stash", "pop"]);
    }

    if (!opts.dryRun && hasWorkingTreeChanges(repoPath, runGitImpl)) {
      runGitImpl(repoPath, ["add", "-A"]);
      runGitImpl(repoPath, ["commit", "-m", opts.message]);
      result.committed = true;
    }

    if (!opts.dryRun) {
      runGitImpl(repoPath, ["push"]);
      result.pushed = true;
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
  }

  return result;
}

/**
 * @param {string} rootPath
 * @param {Array<{ path: string }>} submodules
 * @param {{ dryRun: boolean, rebase: boolean, message: string }} args
 * @param {typeof syncSubmodule} [syncSubmoduleImpl]
 */
export function executeSubmoduleSync(rootPath, submodules, args, syncSubmoduleImpl = syncSubmodule) {
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
    const result = syncSubmoduleImpl(rootPath, submodule.path, args);

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

/**
 * @returns {number} exit code (0 = success or help)
 */
export function main() {
  const parsed = parseSyncSubmodulesArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    printHelp();
    return 0;
  }

  const args = parsed.args;
  const rootPath = path.resolve(args.root);
  const submodules = getSubmodulesFromRoot(rootPath);

  executeSubmoduleSync(rootPath, submodules, args);
  return 0;
}

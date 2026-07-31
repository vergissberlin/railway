#!/usr/bin/env node

/**
 * Syncs `docs/railway-templates-registry.json` from the `badge` blocks of whichever template
 * submodules are checked out.
 *
 * The registry is a cache, not a second source of truth: entries for absent submodules are kept
 * as-is, because "not on disk" means unknown, not deleted. Run `--check` in CI with a recursive
 * submodule checkout to catch drift and templates that still lack badge metadata.
 */
import path from "node:path";
import {
  error,
  info,
  progress,
  success,
  summaryBox,
  warn,
} from "./misc-cli-utils.mjs";
import { getSubmodulesFromRoot } from "./template-cli-lib.mjs";
import {
  REGISTRY_RELATIVE_PATH,
  mergeRegistry,
  missingRegistryEntries,
  readRegistry,
  writeRegistry,
} from "./lib/template-registry.mjs";
import { loadRailwayTemplateMetadataFromDisk } from "./railway-template-targets.mjs";

/**
 * @param {string[]} argv
 * @returns {{ root: string, apply: boolean, check: boolean }}
 */
export function parseArgs(argv) {
  const args = { root: process.cwd(), apply: false, check: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    } else if (arg === "--root") {
      args.root = argv[++i] || args.root;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--check") {
      args.check = true;
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
  node scripts/sync-template-registry.mjs [options]

Without --apply this is a dry run and writes nothing.

Options:
  --root <path>       Root directory (default: current directory)
  --apply             Write ${REGISTRY_RELATIVE_PATH}
  --check             Exit non-zero when the registry is stale or incomplete (for CI)
  -h, --help          Show this help
`);
}

/**
 * @param {{ root: string }} args
 * @returns {{ registry: object, added: string[], changed: string[], withoutBadge: string[], missing: string[], checkedOut: number }}
 */
export function collectRegistryUpdate(args) {
  const rootPath = path.resolve(args.root);
  const submodules = getSubmodulesFromRoot(rootPath);
  const templates = loadRailwayTemplateMetadataFromDisk(rootPath, { allowEmpty: true });
  const current = readRegistry(rootPath);

  const { next, added, changed, withoutBadge } = mergeRegistry(current, templates);

  return {
    registry: next,
    added,
    changed,
    withoutBadge,
    missing: missingRegistryEntries(next, submodules),
    checkedOut: templates.length,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  info("Syncing template badge registry");

  const result = collectRegistryUpdate(args);

  for (const p of result.added) progress("[ADDED]", p, "badge cached", "cyan");
  for (const p of result.changed) progress("[UPDATED]", p, "badge changed", "cyan");
  for (const p of result.withoutBadge) {
    warn(`${p}: no badge block in railway-template.json (cached entry kept)`);
  }
  for (const p of result.missing) {
    warn(`${p}: no badge data anywhere - the footer cannot be built until this is fixed`);
  }

  const stale = result.added.length + result.changed.length > 0;

  if (args.apply) {
    writeRegistry(path.resolve(args.root), result.registry);
    progress("[WRITTEN]", REGISTRY_RELATIVE_PATH, "registry saved", "cyan");
  } else if (stale) {
    progress("[DRY]", REGISTRY_RELATIVE_PATH, "would update", "yellow");
  }

  summaryBox("Template Registry Sync Summary", [
    `Submodules checked out: ${result.checkedOut}`,
    `Added: ${result.added.length}`,
    `Changed: ${result.changed.length}`,
    `Without badge metadata: ${result.withoutBadge.length}`,
    `Missing badge data: ${result.missing.length}`,
  ]);

  if (args.check && (stale || result.missing.length)) {
    throw new Error(
      "Registry is out of date. Run `pnpm templates:registry:sync:apply` and commit the result."
    );
  }

  success("Template registry sync completed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

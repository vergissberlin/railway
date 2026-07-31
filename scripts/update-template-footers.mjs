#!/usr/bin/env node

/**
 * Regenerates `footer.md` (the shared cross-repo badge block) from the badge registry and writes it
 * into every checked-out template README below the `<!-- footer -->` marker.
 *
 * Badge data comes from `docs/railway-templates-registry.json`, which is synced from each repo's
 * `railway-template.json` by `pnpm templates:registry:sync`. Order is the alphabetical submodule
 * path order, so adding a template means adding metadata, never editing a list in this file.
 */
import fs from "node:fs";
import path from "node:path";
import {
  error,
  info,
  progress,
  success,
  summaryBox,
  warn,
} from "./misc-cli-utils.mjs";
import {
  DEFAULT_FOOTER_MARKER,
  applyFooterWithMarker,
  getSubmodulesFromRoot,
  readTextNormalized,
} from "./template-cli-lib.mjs";
import {
  FOOTER_RELATIVE_PATH,
  buildFooterMarkdown,
  readRegistry,
} from "./lib/template-registry.mjs";

/**
 * @param {string[]} argv
 * @returns {{ root: string, marker: string, dryRun: boolean }}
 */
export function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    marker: DEFAULT_FOOTER_MARKER,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    } else if (arg === "--root") {
      args.root = argv[++i] || args.root;
    } else if (arg === "--marker") {
      args.marker = argv[++i] || args.marker;
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
  node scripts/update-template-footers.mjs [options]

Badge data comes from docs/railway-templates-registry.json (see \`pnpm templates:registry:sync\`).

Options:
  --root <path>       Root directory (default: current directory)
  --marker <text>     Footer marker (default: "<!-- footer -->")
  --dry-run           Print changes without writing files
  -h, --help          Show this help
`);
}

/**
 * @param {{ root: string, marker: string, dryRun: boolean }} args
 * @returns {{ footerMarkdown: string, updated: number, unchanged: number, missingReadme: number }}
 */
export function updateFooters(args) {
  const rootPath = path.resolve(args.root);
  const submodules = getSubmodulesFromRoot(rootPath);
  const registry = readRegistry(rootPath);
  const footerMarkdown = buildFooterMarkdown(registry, submodules);

  const counts = { updated: 0, unchanged: 0, missingReadme: 0 };

  for (const submodule of submodules) {
    const readmePath = path.join(rootPath, submodule.path, "README.md");
    if (!fs.existsSync(readmePath)) {
      counts.missingReadme += 1;
      warn(`Missing README: ${submodule.path}`);
      continue;
    }

    const current = readTextNormalized(readmePath);
    const next = applyFooterWithMarker(current, footerMarkdown, args.marker);

    if (next === current) {
      counts.unchanged += 1;
      progress("[OK]", submodule.path, "unchanged", "green");
      continue;
    }

    counts.updated += 1;
    if (args.dryRun) {
      progress("[DRY]", submodule.path, "would update", "yellow");
      continue;
    }

    fs.writeFileSync(readmePath, next, "utf8");
    progress("[UPDATED]", submodule.path, "badge footer updated", "cyan");
  }

  return { footerMarkdown, ...counts };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  info("Updating template README footers with software badges");

  const result = updateFooters(args);

  // `footer.md` is the artifact `pnpm readme:footer` consumes, so keep it in step with the
  // registry. It intentionally does NOT contain the marker line itself — that used to produce a
  // duplicated `<!-- footer -->` in every README.
  const footerPath = path.resolve(args.root, FOOTER_RELATIVE_PATH);
  const nextFooterFile = `${result.footerMarkdown}\n`;
  const currentFooterFile = fs.existsSync(footerPath)
    ? readTextNormalized(footerPath)
    : "";

  if (nextFooterFile !== currentFooterFile) {
    if (args.dryRun) {
      progress("[DRY]", FOOTER_RELATIVE_PATH, "would regenerate", "yellow");
    } else {
      fs.writeFileSync(footerPath, nextFooterFile, "utf8");
      progress("[UPDATED]", FOOTER_RELATIVE_PATH, "regenerated", "cyan");
    }
  }

  summaryBox("Template Footer Badge Summary", [
    `Updated: ${result.updated}`,
    `Unchanged: ${result.unchanged}`,
    `Skipped (missing README): ${result.missingReadme}`,
  ]);
  success("Template footer badge update completed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

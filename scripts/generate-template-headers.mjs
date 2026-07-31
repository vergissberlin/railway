#!/usr/bin/env node

/**
 * Regenerates `template-header.svg` in every checked-out template repo and makes sure the README
 * references it below its H1.
 *
 * Title and logo come from each repo's own `railway-template.json` (`displayName`, `logoFile` /
 * `customIcon`) — there is deliberately no hardcoded list here, so adding a template never means
 * editing this file. A banner only needs its own repo on disk, so a partial checkout is fine.
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
  BANNER_FILENAME,
  DEFAULT_SUBTITLE,
  applyHeaderImage,
  buildBannerForRepo,
} from "./lib/template-banner.mjs";
import { loadRailwayTemplateMetadataFromDisk } from "./railway-template-targets.mjs";

/**
 * @param {string[]} argv
 * @returns {{ root: string, only: string, dryRun: boolean }}
 */
export function parseArgs(argv) {
  const args = { root: process.cwd(), only: "", dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    } else if (arg === "--root") {
      args.root = argv[++i] || args.root;
    } else if (arg === "--only") {
      args.only = argv[++i] || args.only;
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
  node scripts/generate-template-headers.mjs [options]

Reads displayName / logoFile / customIcon from each railwayapp-*/railway-template.json.

Options:
  --root <path>       Root directory (default: current directory)
  --only <folder>     Limit to one template folder (e.g. railwayapp-grafana)
  --dry-run           Print changes without writing files
  -h, --help          Show this help
`);
}

/**
 * @param {{ root: string, only: string, dryRun: boolean }} args
 * @returns {{ updated: number, unchanged: number, skipped: number }}
 */
export function generateHeaders(args) {
  const rootPath = path.resolve(args.root);
  let templates = loadRailwayTemplateMetadataFromDisk(rootPath, { allowEmpty: true });

  if (args.only) {
    templates = templates.filter((t) => t.project === args.only);
    if (templates.length === 0) {
      throw new Error(
        `No railway-template.json found for ${args.only} under ${rootPath}. ` +
          "Check the folder name and that the submodule is checked out."
      );
    }
  }

  const counts = { updated: 0, unchanged: 0, skipped: 0 };

  for (const meta of templates) {
    const repoPath = path.join(rootPath, meta.project);
    const readmePath = path.join(repoPath, "README.md");
    if (!fs.existsSync(readmePath)) {
      counts.skipped += 1;
      warn(`Missing README in ${meta.project}`);
      continue;
    }

    const { svg, warnings } = buildBannerForRepo({
      repoPath,
      title: meta.displayName,
      subtitle: DEFAULT_SUBTITLE,
      logoFile: meta.logoFile,
      customIcon: meta.customIcon,
    });
    for (const message of warnings) warn(`${meta.project}: ${message}`);

    const bannerPath = path.join(repoPath, BANNER_FILENAME);
    const currentSvg = fs.existsSync(bannerPath)
      ? fs.readFileSync(bannerPath, "utf8")
      : "";
    const currentReadme = fs.readFileSync(readmePath, "utf8");
    const nextReadme = applyHeaderImage(currentReadme);

    if (currentSvg === svg && nextReadme === currentReadme) {
      counts.unchanged += 1;
      progress("[OK]", meta.project, "unchanged", "green");
      continue;
    }

    counts.updated += 1;
    if (args.dryRun) {
      progress("[DRY]", meta.project, "would regenerate header", "yellow");
      continue;
    }

    fs.writeFileSync(bannerPath, svg, "utf8");
    if (nextReadme !== currentReadme) {
      fs.writeFileSync(readmePath, nextReadme, "utf8");
    }
    progress("[UPDATED]", meta.project, "header generated", "cyan");
  }

  return counts;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  info("Generating flat template header SVGs");

  const counts = generateHeaders(args);

  if (counts.updated + counts.unchanged + counts.skipped === 0) {
    warn(
      "No template metadata found. Run `git submodule update --init --recursive` " +
        "so the template repos are on disk."
    );
  }

  summaryBox("Template Header Generation Summary", [
    `Updated: ${counts.updated}`,
    `Unchanged: ${counts.unchanged}`,
    `Skipped (missing README): ${counts.skipped}`,
  ]);
  success("Template header generation completed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

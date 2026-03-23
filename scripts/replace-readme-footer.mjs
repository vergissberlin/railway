#!/usr/bin/env node

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
  getSubmodulesFromRoot,
  readTextNormalized,
  replaceFooterContent,
} from "./template-cli-lib.mjs";

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    marker: "<!-- footer -->",
    readmeName: "README.md",
    dryRun: false,
    footerFile: "footer.md",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    } else if (arg === "--root") {
      args.root = argv[++i] || args.root;
    } else if (arg === "--marker") {
      args.marker = argv[++i] || args.marker;
    } else if (arg === "--readme") {
      args.readmeName = argv[++i] || args.readmeName;
    } else if (arg === "--footer-file") {
      args.footerFile = argv[++i] || "";
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
  node scripts/replace-readme-footer.mjs [options]

Options:
  --root <path>       Root directory (default: current directory)
  --footer-file <path> Footer file (default: "footer.md")
  --marker <text>     Footer marker (default: "<!-- footer -->")
  --readme <name>     README filename (default: "README.md")
  --dry-run           Print changes without writing files
  -h, --help          Show this help
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootPath = path.resolve(args.root);
  const footerPath = path.resolve(rootPath, args.footerFile);

  if (!fs.existsSync(footerPath)) {
    throw new Error(`Footer file not found: ${footerPath}`);
  }

  info("Replacing README footers in template submodules");
  const footerContent = readTextNormalized(footerPath);
  const submodules = getSubmodulesFromRoot(rootPath);

  let updated = 0;
  let unchanged = 0;
  let missingReadme = 0;
  let missingMarker = 0;

  for (const submodule of submodules) {
    const readmePath = path.join(rootPath, submodule.path, args.readmeName);
    if (!fs.existsSync(readmePath)) {
      missingReadme += 1;
      warn(`Missing README: ${submodule.path}`);
      continue;
    }

    const current = readTextNormalized(readmePath);
    const next = replaceFooterContent(current, args.marker, footerContent);

    if (next === null) {
      missingMarker += 1;
      warn(`Missing marker in README: ${submodule.path}`);
      continue;
    }

    if (next === current) {
      unchanged += 1;
      progress("[OK]", submodule.path, "unchanged", "green");
      continue;
    }

    updated += 1;
    if (args.dryRun) {
      progress("[DRY]", submodule.path, "would update", "yellow");
    } else {
      fs.writeFileSync(readmePath, next, "utf8");
      progress("[UPDATED]", submodule.path, "footer replaced", "cyan");
    }
  }

  summaryBox("README Footer Replacement Summary", [
    `Updated: ${updated}`,
    `Unchanged: ${unchanged}`,
    `Missing README: ${missingReadme}`,
    `Missing marker: ${missingMarker}`,
  ]);
  success("README footer replacement completed");
}

try {
  main();
} catch (err) {
  error(err.message);
  process.exit(1);
}

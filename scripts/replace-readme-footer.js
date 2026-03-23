#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    marker: "<!-- footer -->",
    readmeName: "README.md",
    dryRun: false,
    footerFile: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
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
      console.error(`Unknown argument: ${arg}`);
      printHelp();
      process.exit(1);
    }
  }

  if (!args.footerFile) {
    console.error("Missing required argument: --footer-file <path>");
    printHelp();
    process.exit(1);
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/replace-readme-footer.js --footer-file <path> [options]

Options:
  --root <path>       Root directory (default: current directory)
  --marker <text>     Footer marker (default: "<!-- footer -->")
  --readme <name>     README filename (default: "README.md")
  --dry-run           Print changes without writing files
  -h, --help          Show this help
`);
}

function readFileNormalized(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function getSubmodulePaths(rootPath) {
  const gitmodulesPath = path.join(rootPath, ".gitmodules");
  if (!fs.existsSync(gitmodulesPath)) {
    throw new Error(`Missing .gitmodules at ${gitmodulesPath}`);
  }

  const content = readFileNormalized(gitmodulesPath);
  const paths = [];
  const regex = /^\s*path\s*=\s*(.+)\s*$/gm;
  let match;
  while ((match = regex.exec(content)) !== null) {
    paths.push(match[1].trim());
  }
  return paths;
}

function replaceFooter(readmeContent, marker, footerContent) {
  const markerIndex = readmeContent.indexOf(marker);
  if (markerIndex < 0) return null;

  const before = readmeContent.slice(0, markerIndex).replace(/\s*$/, "");
  const footer = footerContent.trim();
  return `${before}\n\n${marker}\n${footer}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootPath = path.resolve(args.root);
  const footerPath = path.resolve(rootPath, args.footerFile);

  if (!fs.existsSync(footerPath)) {
    throw new Error(`Footer file not found: ${footerPath}`);
  }

  const footerContent = readFileNormalized(footerPath);
  const submodulePaths = getSubmodulePaths(rootPath);

  let updated = 0;
  let unchanged = 0;
  let missingReadme = 0;
  let missingMarker = 0;

  for (const submodulePath of submodulePaths) {
    const readmePath = path.join(rootPath, submodulePath, args.readmeName);
    if (!fs.existsSync(readmePath)) {
      missingReadme += 1;
      console.log(`SKIP (missing README): ${submodulePath}`);
      continue;
    }

    const current = readFileNormalized(readmePath);
    const next = replaceFooter(current, args.marker, footerContent);

    if (next === null) {
      missingMarker += 1;
      console.log(`SKIP (missing marker): ${submodulePath}`);
      continue;
    }

    if (next === current) {
      unchanged += 1;
      console.log(`OK (unchanged): ${submodulePath}`);
      continue;
    }

    updated += 1;
    if (args.dryRun) {
      console.log(`DRY-RUN (would update): ${submodulePath}`);
    } else {
      fs.writeFileSync(readmePath, next, "utf8");
      console.log(`UPDATED: ${submodulePath}`);
    }
  }

  console.log("\nSummary");
  console.log(`- Updated: ${updated}`);
  console.log(`- Unchanged: ${unchanged}`);
  console.log(`- Missing README: ${missingReadme}`);
  console.log(`- Missing marker: ${missingMarker}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

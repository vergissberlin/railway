#!/usr/bin/env node

"use strict";

const fs = require("fs");
const path = require("path");

const FOOTER_MARKER = "<!-- footer -->";

const TEMPLATE_BADGE_CONFIG = {
  "railwayapp-airbyte": {
    label: "Airbyte",
    color: "615EFF",
    logo: "airbyte",
  },
  "railwayapp-airflow": {
    label: "Apache Airflow",
    color: "017CEE",
    logo: "apacheairflow",
  },
  "railwayapp-codimd": {
    label: "CodiMD",
    color: "0F766E",
    logo: "markdown",
  },
  "railwayapp-email": {
    label: "Email Service",
    color: "2563EB",
    logo: "maildotru",
  },
  "railwayapp-gitlab": {
    label: "GitLab CE",
    color: "FC6D26",
    logo: "gitlab",
  },
  "railwayapp-grafana": {
    label: "Grafana",
    color: "F46800",
    logo: "grafana",
  },
  "railwayapp-homeassistant": {
    label: "Home Assistant",
    color: "18BCF2",
    logo: "homeassistant",
  },
  "railwayapp-influxdb": {
    label: "InfluxDB",
    color: "22ADF6",
    logo: "influxdb",
  },
  "railwayapp-mqtt": {
    label: "Mosquitto MQTT",
    color: "3C5280",
    logo: "eclipsemosquitto",
  },
  "railwayapp-nodered": {
    label: "Node-RED",
    color: "8F0000",
    logo: "nodered",
  },
  "railwayapp-opensearch": {
    label: "OpenSearch",
    color: "005EB8",
    logo: "opensearch",
  },
  "railwayapp-typo3": {
    label: "TYPO3 CMS",
    color: "FF8700",
    logo: "typo3",
  },
};

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      args.root = argv[++i] || args.root;
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

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/update-template-footers.js [options]

Options:
  --root <path>       Root directory (default: current directory)
  --dry-run           Print changes without writing files
  -h, --help          Show this help
`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function toHttpsRepoUrl(repoUrl) {
  if (repoUrl.startsWith("git@github.com:")) {
    return `https://github.com/${repoUrl
      .replace("git@github.com:", "")
      .replace(/\.git$/, "")}`;
  }
  return repoUrl.replace(/\.git$/, "");
}

function getSubmodules(rootPath) {
  const gitmodulesPath = path.join(rootPath, ".gitmodules");
  const content = readText(gitmodulesPath);

  const submodules = [];
  const sections = content.split(/\n(?=\[submodule ")/g);

  for (const section of sections) {
    const pathMatch = section.match(/^\s*path\s*=\s*(.+)\s*$/m);
    const urlMatch = section.match(/^\s*url\s*=\s*(.+)\s*$/m);
    if (!pathMatch || !urlMatch) continue;
    submodules.push({
      path: pathMatch[1].trim(),
      repoUrl: toHttpsRepoUrl(urlMatch[1].trim()),
    });
  }

  return submodules;
}

function makeBadgeMarkdown(cfg, repoUrl) {
  const label = encodeURIComponent(cfg.label);
  const logo = encodeURIComponent(cfg.logo);
  const color = encodeURIComponent(cfg.color);
  const img = `https://img.shields.io/badge/${label}-${color}?style=for-the-badge&logo=${logo}&logoColor=white`;
  return `[![${cfg.label}](${img})](${repoUrl})`;
}

function ensureMarker(content) {
  if (content.includes(FOOTER_MARKER)) return content;
  return `${content.replace(/\s*$/, "")}\n\n${FOOTER_MARKER}\n`;
}

function applyFooter(content, footerMarkdown) {
  const withMarker = ensureMarker(content);
  const idx = withMarker.indexOf(FOOTER_MARKER);
  const before = withMarker.slice(0, idx).replace(/\s*$/, "");
  return `${before}\n\n${FOOTER_MARKER}\n${footerMarkdown}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootPath = path.resolve(args.root);
  const submodules = getSubmodules(rootPath);

  let updated = 0;
  let skippedNoConfig = 0;
  let skippedNoReadme = 0;

  for (const submodule of submodules) {
    const cfg = TEMPLATE_BADGE_CONFIG[submodule.path];
    if (!cfg) {
      skippedNoConfig += 1;
      console.log(`SKIP (no badge config): ${submodule.path}`);
      continue;
    }

    const readmePath = path.join(rootPath, submodule.path, "README.md");
    if (!fs.existsSync(readmePath)) {
      skippedNoReadme += 1;
      console.log(`SKIP (missing README): ${submodule.path}`);
      continue;
    }

    const current = readText(readmePath);
    const badgeLine = makeBadgeMarkdown(cfg, submodule.repoUrl);
    const next = applyFooter(current, badgeLine);

    if (next === current) {
      console.log(`OK (unchanged): ${submodule.path}`);
      continue;
    }

    updated += 1;
    if (args.dryRun) {
      console.log(`DRY-RUN (would update): ${submodule.path}`);
    } else {
      fs.writeFileSync(readmePath, next, "utf8");
      console.log(`UPDATED: ${submodule.path}`);
    }
  }

  console.log("\nSummary");
  console.log(`- Updated: ${updated}`);
  console.log(`- Skipped (no badge config): ${skippedNoConfig}`);
  console.log(`- Skipped (missing README): ${skippedNoReadme}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

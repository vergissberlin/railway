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
  DEFAULT_FOOTER_MARKER,
  applyFooterWithMarker,
  getSubmodulesFromRoot,
  makeBadgeMarkdown,
  readTextNormalized,
} from "./template-cli-lib.mjs";

const TEMPLATE_BADGE_CONFIG = {
  "railwayapp-airbyte": { label: "Airbyte", color: "615EFF", logo: "airbyte" },
  "railwayapp-airflow": {
    label: "Apache Airflow",
    color: "017CEE",
    logo: "apacheairflow",
  },
  "railwayapp-codimd": { label: "CodiMD", color: "0F766E", logo: "markdown" },
  "railwayapp-email": {
    label: "Email Service",
    color: "2563EB",
    logo: "maildotru",
  },
  "railwayapp-gitlab": { label: "GitLab CE", color: "FC6D26", logo: "gitlab" },
  "railwayapp-grafana": { label: "Grafana", color: "F46800", logo: "grafana" },
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
  "railwayapp-mongodb": {
    label: "MongoDB",
    color: "47A248",
    logo: "mongodb",
  },
  "railwayapp-mqtt": {
    label: "Mosquitto MQTT",
    color: "3C5280",
    logo: "eclipsemosquitto",
  },
  "railwayapp-mysql": {
    label: "MySQL",
    color: "4479A1",
    logo: "mysql",
  },
  "railwayapp-n8n": { label: "n8n", color: "EA4B71", logo: "n8n" },
  "railwayapp-nodered": { label: "Node-RED", color: "8F0000", logo: "nodered" },
  "railwayapp-nodejs": {
    label: "Node.js",
    color: "339933",
    logo: "nodedotjs",
  },
  "railwayapp-opensearch": {
    label: "OpenSearch",
    color: "005EB8",
    logo: "opensearch",
  },
  "railwayapp-postgresql": {
    label: "PostgreSQL",
    color: "4169E1",
    logo: "postgresql",
  },
  "railwayapp-typo3": { label: "TYPO3 CMS", color: "FF8700", logo: "typo3" },
};

/** Order of badges in the shared README footer (cross-links to all template repos). */
const FOOTER_BADGE_ORDER = [
  "railwayapp-airbyte",
  "railwayapp-airflow",
  "railwayapp-codimd",
  "railwayapp-email",
  "railwayapp-gitlab",
  "railwayapp-grafana",
  "railwayapp-homeassistant",
  "railwayapp-influxdb",
  "railwayapp-mongodb",
  "railwayapp-mqtt",
  "railwayapp-mysql",
  "railwayapp-n8n",
  "railwayapp-nodered",
  "railwayapp-nodejs",
  "railwayapp-opensearch",
  "railwayapp-postgresql",
  "railwayapp-typo3",
];

function buildFullFooterMarkdown(submodules) {
  const urlByPath = Object.fromEntries(
    submodules.map((s) => [s.path, s.repoUrl])
  );
  const parts = [];
  for (const p of FOOTER_BADGE_ORDER) {
    const cfg = TEMPLATE_BADGE_CONFIG[p];
    const url = urlByPath[p];
    if (!cfg || !url) {
      throw new Error(`Missing badge config or submodule URL for ${p}`);
    }
    parts.push(makeBadgeMarkdown(cfg, url));
  }
  return `---\n\n${parts.join(" ")}`;
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    dryRun: false,
    marker: DEFAULT_FOOTER_MARKER,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--root") {
      args.root = argv[++i] || args.root;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--marker") {
      args.marker = argv[++i] || args.marker;
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

Options:
  --root <path>       Root directory (default: current directory)
  --marker <text>     Footer marker (default: "<!-- footer -->")
  --dry-run           Print changes without writing files
  -h, --help          Show this help
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootPath = path.resolve(args.root);
  const submodules = getSubmodulesFromRoot(rootPath);

  info("Updating template README footers with software badges");

  let updated = 0;
  let skippedNoConfig = 0;
  let skippedNoReadme = 0;
  let unchanged = 0;

  for (const submodule of submodules) {
    const cfg = TEMPLATE_BADGE_CONFIG[submodule.path];
    if (!cfg) {
      skippedNoConfig += 1;
      warn(`No badge config for ${submodule.path}`);
      continue;
    }

    const readmePath = path.join(rootPath, submodule.path, "README.md");
    if (!fs.existsSync(readmePath)) {
      skippedNoReadme += 1;
      warn(`Missing README: ${submodule.path}`);
      continue;
    }

    const current = readTextNormalized(readmePath);
    const footerMarkdown = buildFullFooterMarkdown(submodules);
    const next = applyFooterWithMarker(current, footerMarkdown, args.marker);

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
      progress("[UPDATED]", submodule.path, "badge footer updated", "cyan");
    }
  }

  summaryBox("Template Footer Badge Summary", [
    `Updated: ${updated}`,
    `Unchanged: ${unchanged}`,
    `Skipped (no badge config): ${skippedNoConfig}`,
    `Skipped (missing README): ${skippedNoReadme}`,
  ]);
  success("Template footer badge update completed");
}

try {
  main();
} catch (err) {
  error(err.message);
  process.exit(1);
}

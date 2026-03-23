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

const ROOT = process.cwd();

const CONFIG = {
  "railwayapp-airbyte": {
    title: "Airbyte",
    subtitle: "Railway Template",
    logoFile: "railwayapp-airbyte.svg",
  },
  "railwayapp-airflow": {
    title: "Apache Airflow",
    subtitle: "Railway Template",
    logoFile: "railwayapp-airflow.svg",
  },
  "railwayapp-codimd": {
    title: "CodiMD",
    subtitle: "Railway Template",
    logoFile: "codimd-logo.png",
  },
  "railwayapp-email": {
    title: "Email Service",
    subtitle: "Railway Template",
    customIcon: "email",
  },
  "railwayapp-gitlab": {
    title: "GitLab CE",
    subtitle: "Railway Template",
    logoFile: "railwayapp-gitlab.svg",
  },
  "railwayapp-grafana": {
    title: "Grafana",
    subtitle: "Railway Template",
    logoFile: "railwayapp-grafana.png",
  },
  "railwayapp-homeassistant": {
    title: "Home Assistant",
    subtitle: "Railway Template",
    logoFile: "railwayapp-homeassistant.svg",
  },
  "railwayapp-influxdb": {
    title: "InfluxDB",
    subtitle: "Railway Template",
    logoFile: "logo-influxdb.png",
  },
  "railwayapp-mqtt": {
    title: "Mosquitto MQTT",
    subtitle: "Railway Template",
    logoFile: "mosquitto.svg",
  },
  "railwayapp-nodered": {
    title: "Node-RED",
    subtitle: "Railway Template",
    customIcon: "nodered",
  },
  "railwayapp-opensearch": {
    title: "OpenSearch",
    subtitle: "Railway Template",
    logoFile: "railwayapp-opensearch.svg",
  },
  "railwayapp-typo3": {
    title: "TYPO3 CMS",
    subtitle: "Railway Template",
    logoFile: "logo-typo3.png",
  },
};

function mimeFor(file) {
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  return "application/octet-stream";
}

function toDataUri(filePath) {
  const data = fs.readFileSync(filePath);
  const ext = mimeFor(filePath);
  return `data:${ext};base64,${data.toString("base64")}`;
}

function customIconSvg(name) {
  if (name === "email") {
    return `
      <rect x="84" y="84" width="112" height="84" rx="14" fill="#1E293B" stroke="#38BDF8" stroke-width="4"/>
      <path d="M92 98 L140 132 L188 98" stroke="#7DD3FC" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    `;
  }
  if (name === "nodered") {
    return `
      <circle cx="102" cy="124" r="14" fill="#7F1D1D"/>
      <circle cx="140" cy="98" r="14" fill="#991B1B"/>
      <circle cx="178" cy="124" r="14" fill="#B91C1C"/>
      <path d="M116 117 L126 109 M154 109 L164 117 M116 131 L164 131" stroke="#FCA5A5" stroke-width="4" fill="none" stroke-linecap="round"/>
    `;
  }
  return "";
}

function buildBanner({ title, subtitle, logoDataUri, customIcon }) {
  const logoLayer = logoDataUri
    ? `
      <rect x="64" y="60" width="152" height="152" rx="24" fill="#0B1228" opacity="0.92"/>
      <image href="${logoDataUri}" x="84" y="80" width="112" height="112" preserveAspectRatio="xMidYMid meet"/>
    `
    : `
      <rect x="64" y="60" width="152" height="152" rx="24" fill="#0B1228" opacity="0.92"/>
      ${customIconSvg(customIcon)}
    `;

  return `<svg width="1280" height="270" viewBox="0 0 1280 270" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${title} header banner</title>
  <desc id="desc">Flat gradient banner for ${title} template with software logo.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1280" y2="270" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0B1021"/>
      <stop offset="0.55" stop-color="#131B3F"/>
      <stop offset="1" stop-color="#1F174A"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="270" rx="26" fill="url(#bg)"/>
  <circle cx="1120" cy="68" r="34" fill="#4F46E5" opacity="0.33"/>
  <circle cx="1185" cy="205" r="56" fill="#06B6D4" opacity="0.15"/>
  ${logoLayer}
  <text x="258" y="122" fill="#FFFFFF" font-family="Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="52" font-weight="800">${title}</text>
  <text x="258" y="168" fill="#B6C2FF" font-family="Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="28" font-weight="500">${subtitle}</text>
  <rect x="258" y="188" width="286" height="44" rx="22" fill="#1C285D" stroke="#67E8F9" stroke-opacity="0.6"/>
  <text x="284" y="216" fill="#CFFAFE" font-family="Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="19" font-weight="700">Deploy on Railway</text>
</svg>
`;
}

function updateReadme(readmePath) {
  let content = fs.readFileSync(readmePath, "utf8").replace(/\r\n/g, "\n");
  const headerImage = "![Template Header](./template-header.svg)";

  if (!content.includes(headerImage)) {
    const lines = content.split("\n");
    if (lines.length > 0 && lines[0].startsWith("# ")) {
      lines.splice(1, 0, "", headerImage, "");
      content = lines.join("\n");
    } else {
      content = `${headerImage}\n\n${content}`;
    }
  }

  content = content.replace(
    /!\[[^\]]*\]\(\.\/[^)\n]+\.(svg|png)\)\n\n/g,
    (m) => (m.includes("template-header.svg") ? m : "")
  );
  content = content.replace(/<img\s+src="\.\/[^"]+\.(svg|png)"[^>]*>\n\n/g, "");

  fs.writeFileSync(readmePath, content, "utf8");
}

function main() {
  info("Generating flat template header SVGs");
  let updated = 0;

  for (const [repo, cfg] of Object.entries(CONFIG)) {
    const repoPath = path.join(ROOT, repo);
    const readmePath = path.join(repoPath, "README.md");
    const bannerPath = path.join(repoPath, "template-header.svg");

    if (!fs.existsSync(readmePath)) {
      warn(`Missing README in ${repo}`);
      continue;
    }

    let logoDataUri = "";
    if (cfg.logoFile) {
      const logoPath = path.join(repoPath, cfg.logoFile);
      if (fs.existsSync(logoPath)) {
        logoDataUri = toDataUri(logoPath);
      } else {
        warn(`Missing logo file in ${repo}: ${cfg.logoFile}`);
      }
    }

    const svg = buildBanner({
      title: cfg.title,
      subtitle: cfg.subtitle,
      logoDataUri,
      customIcon: cfg.customIcon,
    });

    fs.writeFileSync(bannerPath, svg, "utf8");
    updateReadme(readmePath);
    updated += 1;
    progress("[UPDATED]", repo, "header generated", "cyan");
  }

  summaryBox("Template Header Generation Summary", [`Updated: ${updated}`]);
  success("Template header generation completed");
}

try {
  main();
} catch (err) {
  error(err.message);
  process.exit(1);
}

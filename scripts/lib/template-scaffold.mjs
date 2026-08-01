/**
 * Renders the file set of a new `railwayapp-*` template repository.
 *
 * Everything here is pure: `buildTemplateFiles()` returns a path -> content map and touches no
 * filesystem, so the whole scaffold is testable and a dry run shows exactly what an apply writes.
 *
 * Three deliberate departures from the older hand-built repos, all of them fixes:
 *  - `.env.example` is tracked and `.env` is ignored. The existing repos track `.env` despite
 *    listing it in `.gitignore`, which invites a real credential into git on the next `git add -A`.
 *  - no `railway.json`; `railway.toml` is the single source of truth for deploy settings.
 *  - `release-please-config.json` carries the `packages` block that release-please v4 requires.
 *    Without it no release ever runs, which is why the older repos still sit at 0.1.0 with no tags.
 */
import {
  BANNER_FILENAME,
  DEFAULT_SUBTITLE,
  buildBanner,
  knownCustomIcons,
} from "./template-banner.mjs";
import { validateRailwayTemplatePublishDescription } from "../template-cli-lib.mjs";

/** Owner referral code used in every deploy button. */
export const REFERRAL_CODE = "2_sIT9";

/**
 * Railway assigns the deploy code only when a template is published, so the scaffold cannot know
 * it. The placeholder is replaced in a later step once the code exists.
 */
export const DEPLOY_CODE_PLACEHOLDER = "REPLACE_WITH_RAILWAY_TEMPLATE_CODE";

export const GITHUB_OWNER = "vergissberlin";

/** How the template hands Railway's `$PORT` to the software. */
export const PORT_STRATEGIES = ["entrypoint", "startCommand", "none"];

/**
 * @typedef {Object} TemplateSpec
 * @property {string} displayName Software title, e.g. "Uptime Kuma"
 * @property {string} slug lowercase slug, e.g. "uptime-kuma"
 * @property {string} description 25-75 chars, English
 * @property {string} upstreamImage e.g. "louislam/uptime-kuma"
 * @property {string} versionTag pinned tag, e.g. "1.23"
 * @property {number} port default HTTP port
 * @property {string} healthcheckPath e.g. "/api/health"
 * @property {string} mountPath volume mount path, e.g. "/app/data"
 * @property {string} [owner] GitHub owner (default vergissberlin)
 * @property {string} [licenseHolder] MIT copyright holder
 * @property {number} [licenseYear]
 * @property {string} [docsUrl] upstream documentation URL
 * @property {string} [portStrategy] one of PORT_STRATEGIES
 * @property {string} [portEnvVar] env var the software reads for its port or bind address
 * @property {string} [upstreamEntrypoint] upstream entrypoint the wrapper execs
 * @property {string} [upstreamCommand] Dockerfile CMD
 * @property {string} [logoFile] logo filename inside the repo
 * @property {string} [customIcon] fallback icon name when there is no logo
 * @property {{label: string, color: string, logo: string}} [badge]
 * @property {{key: string, value: string, comment?: string}[]} [envVars]
 * @property {string[]} [features] README feature bullets
 */

/**
 * Validates a spec and fills in the derived values. Fails on anything that would only surface
 * later as an opaque Railway API rejection or a broken build.
 *
 * @param {TemplateSpec} spec
 * @returns {TemplateSpec & {project: string, repo: string, image: string, repoUrl: string}}
 */
export function normalizeSpec(spec) {
  const required = [
    "displayName",
    "slug",
    "description",
    "upstreamImage",
    "versionTag",
    "port",
    "healthcheckPath",
    "mountPath",
  ];
  const missing = required.filter((k) => spec[k] === undefined || spec[k] === "");
  if (missing.length) {
    throw new Error(`Missing required option(s): ${missing.join(", ")}`);
  }

  const slug = String(spec.slug).trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `slug must be lowercase alphanumeric segments separated by single dashes (got "${spec.slug}")`
    );
  }

  const port = Number(spec.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`port must be an integer between 1 and 65535 (got "${spec.port}")`);
  }

  const descriptionCheck = validateRailwayTemplatePublishDescription(spec.description);
  if (!descriptionCheck.ok) {
    throw new Error(descriptionCheck.error);
  }

  const portStrategy = spec.portStrategy ?? "none";
  if (!PORT_STRATEGIES.includes(portStrategy)) {
    throw new Error(
      `portStrategy must be one of ${PORT_STRATEGIES.join(", ")} (got "${portStrategy}")`
    );
  }
  if (portStrategy !== "none" && !spec.portEnvVar) {
    throw new Error(`portStrategy "${portStrategy}" requires portEnvVar`);
  }
  if (portStrategy === "entrypoint" && !spec.upstreamEntrypoint) {
    throw new Error('portStrategy "entrypoint" requires upstreamEntrypoint');
  }

  if (spec.customIcon && !knownCustomIcons().includes(spec.customIcon)) {
    throw new Error(
      `Unknown customIcon "${spec.customIcon}" (known: ${knownCustomIcons().join(", ")})`
    );
  }
  if (!spec.healthcheckPath.startsWith("/")) {
    throw new Error(`healthcheckPath must start with "/" (got "${spec.healthcheckPath}")`);
  }
  if (!spec.mountPath.startsWith("/")) {
    throw new Error(`mountPath must start with "/" (got "${spec.mountPath}")`);
  }

  const owner = spec.owner ?? GITHUB_OWNER;
  const project = `railwayapp-${slug}`;

  return {
    ...spec,
    slug,
    port,
    owner,
    project,
    repo: `${owner}/${project}`,
    repoUrl: `https://github.com/${owner}/${project}`,
    image: `https://raw.githubusercontent.com/${owner}/${project}/main/${BANNER_FILENAME}`,
    description: descriptionCheck.value,
    portStrategy,
    licenseHolder: spec.licenseHolder ?? "André Lademann",
    licenseYear: spec.licenseYear ?? 2026,
    docsUrl: spec.docsUrl ?? "",
    envVars: spec.envVars ?? [],
    features: spec.features?.length
      ? spec.features
      : [
          `${spec.displayName} on Railway with a Dockerfile build`,
          "Pinned upstream image so Renovate can raise update PRs",
          "Healthcheck and restart policy preconfigured",
          "Persistent volume mount path declared",
        ],
  };
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderReadme(s) {
  const deployUrl = `https://railway.com/deploy/${DEPLOY_CODE_PLACEHOLDER}?referralCode=${REFERRAL_CODE}&utm_medium=integration&utm_source=template&utm_campaign=generic`;
  const envBlock = s.envVars.length
    ? s.envVars
        .map((v) => `${v.key}=${v.value}${v.comment ? `   # ${v.comment}` : ""}`)
        .join("\n")
    : "# This template needs no required variables.";

  const runtimeNote =
    s.portStrategy === "entrypoint"
      ? `The image entrypoint (\`railway-entrypoint.sh\`) maps \`$PORT\` to \`${s.portEnvVar}\` and then
delegates to the upstream entrypoint, so the upstream initialisation still runs. Overriding the
start command in Railway skips both steps.`
      : s.portStrategy === "startCommand"
        ? `\`railway.toml\` sets a start command that exports \`${s.portEnvVar}\` from \`$PORT\` before
launching ${s.displayName}. Railway ignores the Dockerfile \`EXPOSE\` directive and routes public
traffic to \`$PORT\`.`
        : `${s.displayName} listens on \`$PORT\` directly, so no start command is configured.`;

  const resources = [
    s.docsUrl ? `* [${s.displayName} documentation](${s.docsUrl})` : "",
    "* [Railway documentation](https://docs.railway.app/)",
    "* [Template updates](https://docs.railway.com/reference/templates#updatable-templates)",
  ]
    .filter(Boolean)
    .join("\n");

  return `# ${s.displayName} for railway.app

![Template Header](./${BANNER_FILENAME})

Deploy ${s.displayName} on Railway with one click.

[![Deploy on Railway](https://railway.com/button.svg)](${deployUrl})

## ✨ Features

${s.features.map((f) => `* ${f}`).join("\n")}

## 🚀 Quick Start

1. Click "Deploy on Railway"
2. Set the environment variables listed below
3. Attach a volume at \`${s.mountPath}\` before sending production traffic
4. Wait for the build and open the generated URL

## ⚙️ Configuration

### Environment variables

\`\`\`bash
${envBlock}
\`\`\`

Set real credentials as Railway variables, never in a file inside this repository.

### Optional

* \`PORT\`: HTTP port ${s.displayName} binds to (default: \`${s.port}\`). Railway sets this for you;
  leave it alone unless you also change the domain's target port.

## 💾 Persistence

\`railway.toml\` declares \`requiredMountPath = "${s.mountPath}"\`. Attach a Railway volume to that
path before production traffic, otherwise all data is lost on every redeploy.

## 🐳 Local Development

\`\`\`bash
git clone ${s.repoUrl}.git
cd ${s.project}
cp .env.example .env
docker compose up -d
\`\`\`

Then open http://localhost:${s.port}.

## 🪲 Bug Reporting

Found a bug? [Create an issue](${s.repoUrl}/issues/new) or open a pull request with a fix.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## 📝 License

MIT — see [LICENSE](LICENSE).

## 🔒 Security

* All credentials are supplied as environment variables, never committed
* Railway terminates TLS for the generated domain
* Renovate keeps the pinned upstream image up to date

## Railway runtime defaults

\`railway.toml\` ships these defaults:

* Healthcheck path: \`${s.healthcheckPath}\`
* Restart policy: \`ON_FAILURE\` with up to 10 retries
* Dockerfile-based build

${runtimeNote}

## 📚 Resources

${resources}

<!-- footer -->
`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderDockerfile(s) {
  const lines = [
    `ARG VERSION=${s.versionTag}`,
    "",
    `FROM ${s.upstreamImage}:\${VERSION}`,
    "",
    'LABEL maintainer="VergissBerlin"',
    `LABEL description="${s.displayName} Template for Railway"`,
    "",
    "# Railway ignores EXPOSE and routes traffic to the port named by $PORT.",
    "# EXPOSE documents the local default, ENV PORT keeps that default reproducible.",
    `ENV PORT=${s.port}`,
    `EXPOSE ${s.port}`,
  ];

  if (s.portStrategy === "entrypoint") {
    lines.push(
      "",
      `# Translate Railway's $PORT into ${s.portEnvVar}, then delegate to the upstream`,
      "# entrypoint so its initialisation and privilege drop still happen.",
      "COPY railway-entrypoint.sh /usr/local/bin/railway-entrypoint.sh",
      "RUN chmod +x /usr/local/bin/railway-entrypoint.sh",
      "",
      'ENTRYPOINT ["/usr/local/bin/railway-entrypoint.sh"]'
    );
    if (s.upstreamCommand) {
      lines.push(`CMD ["${s.upstreamCommand}"]`);
    }
  }

  return `${lines.join("\n")}\n`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderEntrypoint(s) {
  return `#!/bin/bash
set -euo pipefail

readonly UPSTREAM_ENTRYPOINT='${s.upstreamEntrypoint}'
port="\${PORT:-${s.port}}"

if ! [[ "\${port}" =~ ^[0-9]+$ ]] || ((port < 1 || port > 65535)); then
	echo "railway-entrypoint: PORT='\${port}' is not a valid port number (1-65535)" >&2
	exit 1
fi

# An explicitly configured value always wins over the derived one.
export ${s.portEnvVar}="\${${s.portEnvVar}:-\${port}}"

exec "\${UPSTREAM_ENTRYPOINT}" "$@"
`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderRailwayToml(s) {
  const deploy = ['[deploy]'];
  if (s.portStrategy === "startCommand") {
    deploy.push(
      `startCommand = "sh -c 'export ${s.portEnvVar}=\${PORT:-${s.port}}; ${s.upstreamCommand ?? "/entrypoint.sh"}'"`
    );
  }
  deploy.push(
    `healthcheckPath = "${s.healthcheckPath}"`,
    "healthcheckTimeout = 300",
    'restartPolicyType = "ON_FAILURE"',
    "restartPolicyMaxRetries = 10",
    `requiredMountPath = "${s.mountPath}"`
  );

  return `[build]
builder = "DOCKERFILE"

${deploy.join("\n")}
`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderTemplateJson(s) {
  const data = {
    $schema:
      "https://raw.githubusercontent.com/vergissberlin/railway/main/docs/railway-template.schema.json",
    schemaVersion: 1,
    project: s.project,
    repo: s.repo,
    displayName: s.displayName,
    publishedCode: s.slug,
    image: s.image,
    description: s.description,
    workspaceAutomation: true,
  };
  if (s.logoFile) data.logoFile = s.logoFile;
  if (s.customIcon) data.customIcon = s.customIcon;
  if (s.badge) data.badge = s.badge;

  return `${JSON.stringify(data, null, 2)}\n`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderDockerCompose(s) {
  const env = [
    "      - TZ=Europe/Berlin",
    ...s.envVars.map((v) => `      - ${v.key}=\${${v.key}}`),
  ].join("\n");

  return `version: '3.6'

services:
  ${s.slug}:
    build:
      context: ./
      dockerfile: Dockerfile
    container_name: ${s.slug}-development
    restart: unless-stopped
    environment:
${env}
    ports:
      - ${s.port}:${s.port}
    volumes:
      - ./data/${s.slug}:${s.mountPath}
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:${s.port}${s.healthcheckPath}"]
      interval: 30s
      timeout: 10s
      retries: 3
`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderEnvExample(s) {
  const lines = [
    "# Copy to `.env` for local development with docker compose.",
    "# Never commit `.env`. On Railway, set these as project variables instead.",
    "",
    `PORT=${s.port}`,
    `VERSION=${s.versionTag}`,
  ];
  if (s.envVars.length) {
    lines.push("");
    for (const v of s.envVars) {
      lines.push(`${v.key}=${v.value}${v.comment ? `   # ${v.comment}` : ""}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderReleasePleaseConfig(s) {
  const data = {
    $schema:
      "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
    "release-type": "simple",
    "include-component-in-tag": true,
    packages: {
      ".": { component: s.project },
    },
    "changelog-sections": [
      { type: "feat", section: "Features", hidden: false },
      { type: "fix", section: "Bug Fixes", hidden: false },
      { type: "refactor", section: "Refactoring", hidden: false },
      { type: "docs", section: "Documentation", hidden: false },
      { type: "test", section: "Tests", hidden: false },
      { type: "chore", section: "Chores", hidden: false },
    ],
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderAgentMd(s) {
  return `# AGENTS.md

## Purpose

This file defines template-specific agent conventions for this Railway app.

## Scope

These rules apply to \`${s.project}\`.
The workspace root \`AGENTS.md\` also applies.

## Conventions

- Use \`pnpm\` as the default package manager when package management is needed.
- Store credentials and local secrets in \`.env\` files, which are never committed.
- Use Conventional Commits in English.
- Keep all documentation in English.
- When adding new props, always update matching Type definitions and related documentation.

## Railway Checks

- Keep \`railway.toml\` consistent with runtime behavior.
- Validate \`startCommand\`, \`healthcheckPath\`, and \`healthcheckTimeout\` after changes.
- Keep Docker and entrypoint changes minimal and reproducible.
`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderContributing(s) {
  return `# Contributing to the Railway ${s.displayName} Template

## Getting started

\`\`\`bash
git clone ${s.repoUrl}.git
cd ${s.project}
cp .env.example .env
docker compose up -d
\`\`\`

\`.env\` is git-ignored on purpose. Never commit real credentials — on Railway they belong in the
project variables.

## Making changes

1. Create a branch (\`git checkout -b feat/my-change\`)
2. Use Conventional Commits in English (\`feat:\`, \`fix:\`, \`docs:\`, \`chore:\`)
3. Verify the container still starts and the healthcheck at \`${s.healthcheckPath}\` responds
4. Open a pull request

Releases and version bumps are handled by release-please. Do not edit \`version.txt\` or
\`CHANGELOG.md\` by hand.

## License

By contributing you agree that your work is published under the MIT License.
`;
}

/** @param {ReturnType<typeof normalizeSpec>} s */
function renderLicense(s) {
  return `MIT License

Copyright (c) ${s.licenseYear} ${s.licenseHolder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;
}

const RELEASE_PLEASE_WORKFLOW = `name: release-please

on:
  workflow_dispatch:
  push:
    branches:
      - main

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json
`;

const DOCKERIGNORE = `.git
.gitignore
.env
.env.*
docker-compose.yml
data/
*.md
`;

/**
 * Renders every text file of the new repository.
 *
 * @param {TemplateSpec} rawSpec
 * @returns {{ spec: ReturnType<typeof normalizeSpec>, files: Map<string, string> }}
 */
export function buildTemplateFiles(rawSpec) {
  const s = normalizeSpec(rawSpec);
  const files = new Map();

  files.set("README.md", renderReadme(s));
  files.set("Dockerfile", renderDockerfile(s));
  files.set("docker-compose.yml", renderDockerCompose(s));
  files.set("railway.toml", renderRailwayToml(s));
  files.set("railway-template.json", renderTemplateJson(s));
  files.set("AGENTS.md", renderAgentMd(s));
  files.set("CONTRIBUTING.md", renderContributing(s));
  files.set("LICENSE", renderLicense(s));
  files.set(
    "CHANGELOG.md",
    "# Changelog\n\nAll notable changes to this project will be documented in this file.\n"
  );
  files.set(".dockerignore", DOCKERIGNORE);
  files.set(
    ".gitignore",
    `.env\n.env.*\n!.env.example\n\n# Local container data\ndata/\n\n# OS files\n.DS_Store\nThumbs.db\n`
  );
  files.set(".env.example", renderEnvExample(s));
  files.set(
    "renovate.json",
    `${JSON.stringify(
      {
        $schema: "https://docs.renovatebot.com/renovate-schema.json",
        extends: ["config:recommended"],
      },
      null,
      2
    )}\n`
  );
  files.set("version.txt", "0.1.0\n");
  files.set(".release-please-manifest.json", `${JSON.stringify({ ".": "0.1.0" }, null, 2)}\n`);
  files.set("release-please-config.json", renderReleasePleaseConfig(s));
  files.set(".github/workflows/release-please.yml", RELEASE_PLEASE_WORKFLOW);

  if (s.portStrategy === "entrypoint") {
    files.set("railway-entrypoint.sh", renderEntrypoint(s));
  }

  // The banner is written without a logo here; the CLI regenerates it after copying the logo in,
  // so a repo is never left without the header graphic its README references.
  files.set(
    BANNER_FILENAME,
    buildBanner({
      title: s.displayName,
      subtitle: DEFAULT_SUBTITLE,
      customIcon: s.customIcon,
    })
  );

  return { spec: s, files };
}

/** Files that must be executable after writing. */
export const EXECUTABLE_FILES = ["railway-entrypoint.sh"];

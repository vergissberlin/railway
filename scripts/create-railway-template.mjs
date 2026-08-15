#!/usr/bin/env node

/**
 * Scaffolds a new `railwayapp-<slug>` template repository following the house pattern.
 *
 * Dry run by default: without `--apply` nothing is written, so the full file list can be reviewed
 * before a public repository exists. Pass the spec either as flags or, more comfortably for larger
 * specs, as a JSON file via `--spec`.
 *
 *   node scripts/create-railway-template.mjs --spec /tmp/uptime-kuma.json
 *   node scripts/create-railway-template.mjs --spec /tmp/uptime-kuma.json --apply
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
  buildBannerForRepo,
  logoFileNameFor,
} from "./lib/template-banner.mjs";
import {
  DEPLOY_CODE_PLACEHOLDER,
  EXECUTABLE_FILES,
  buildTemplateFiles,
} from "./lib/template-scaffold.mjs";

const NUMBER_KEYS = new Set(["port", "licenseYear"]);

const FLAG_TO_KEY = {
  "--display-name": "displayName",
  "--slug": "slug",
  "--description": "description",
  "--upstream-image": "upstreamImage",
  "--tag": "versionTag",
  "--port": "port",
  "--healthcheck": "healthcheckPath",
  "--mount": "mountPath",
  "--owner": "owner",
  "--license-holder": "licenseHolder",
  "--license-year": "licenseYear",
  "--docs-url": "docsUrl",
  "--port-strategy": "portStrategy",
  "--port-env": "portEnvVar",
  "--upstream-entrypoint": "upstreamEntrypoint",
  "--command": "upstreamCommand",
  "--custom-icon": "customIcon",
};

/**
 * @param {string[]} argv
 * @returns {{ spec: object, root: string, out: string, logo: string, apply: boolean, force: boolean }}
 */
export function parseArgs(argv) {
  const args = {
    spec: {},
    root: process.cwd(),
    out: "",
    logo: "",
    apply: false,
    force: false,
  };
  const badge = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    } else if (arg === "--spec") {
      const file = argv[++i];
      if (!file) throw new Error("--spec requires a file path");
      args.spec = { ...args.spec, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    } else if (arg === "--root") {
      args.root = argv[++i] || args.root;
    } else if (arg === "--out") {
      args.out = argv[++i] || args.out;
    } else if (arg === "--logo") {
      args.logo = argv[++i] || args.logo;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--env") {
      const raw = argv[++i] ?? "";
      const eq = raw.indexOf("=");
      if (eq < 1) throw new Error(`--env expects KEY=VALUE (got "${raw}")`);
      args.spec.envVars = [
        ...(args.spec.envVars ?? []),
        { key: raw.slice(0, eq), value: raw.slice(eq + 1) },
      ];
    } else if (arg === "--feature") {
      args.spec.features = [...(args.spec.features ?? []), argv[++i] ?? ""];
    } else if (arg === "--badge-label") {
      badge.label = argv[++i] ?? "";
    } else if (arg === "--badge-color") {
      badge.color = (argv[++i] ?? "").replace(/^#/, "");
    } else if (arg === "--badge-logo") {
      badge.logo = argv[++i] ?? "";
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (FLAG_TO_KEY[arg]) {
      const key = FLAG_TO_KEY[arg];
      const value = argv[++i];
      args.spec[key] = NUMBER_KEYS.has(key) ? Number(value) : value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (Object.keys(badge).length) {
    args.spec.badge = { ...(args.spec.badge ?? {}), ...badge };
  }

  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/create-railway-template.mjs --spec <file.json> [--apply]
  node scripts/create-railway-template.mjs --display-name "Uptime Kuma" --slug uptime-kuma ... [--apply]

Without --apply this is a dry run and writes nothing.

Spec options (flags override --spec values):
  --display-name <s>        Software title, e.g. "Uptime Kuma"
  --slug <s>                Lowercase slug; the repo becomes railwayapp-<slug>
  --description <s>         English, 25-75 characters (Railway rejects anything else)
  --upstream-image <s>      Docker image, e.g. louislam/uptime-kuma
  --tag <s>                 Pinned image tag; never "latest" or Renovate cannot update it
  --port <n>                Default HTTP port
  --healthcheck <path>      Healthcheck path, e.g. /api/health
  --mount <path>            Volume mount path, e.g. /app/data
  --port-strategy <s>       entrypoint | startCommand | none
  --port-env <s>            Env var the software reads for its port or bind address
  --upstream-entrypoint <s> Upstream entrypoint the wrapper execs (portStrategy=entrypoint)
  --command <s>             Container command / upstream launcher
  --owner <s>               GitHub owner (default vergissberlin)
  --license-holder <s>      MIT copyright holder
  --docs-url <url>          Upstream documentation URL
  --custom-icon <s>         Built-in banner icon when there is no logo file
  --badge-label/-color/-logo shields.io badge for the shared README footer
  --env KEY=VALUE           Repeatable environment variable
  --feature <s>             Repeatable README feature bullet

Output options:
  --root <path>             Monorepo root (default: current directory)
  --out <path>              Target directory (default: <root>/railwayapp-<slug>)
  --logo <path>             Logo file to copy in and inline into the banner
  --apply                   Actually write files
  --force                   Overwrite an existing non-empty target directory
  -h, --help                Show this help
`);
}

/**
 * @param {{ spec: object, root: string, out: string, logo: string, apply: boolean, force: boolean }} args
 * @returns {{ spec: object, targetDir: string, files: Map<string, string>, logoTarget: string }}
 */
export function planScaffold(args) {
  const { spec, files } = buildTemplateFiles(args.spec);
  const rootPath = path.resolve(args.root);
  const targetDir = args.out
    ? path.resolve(args.out)
    : path.join(rootPath, spec.project);

  let logoTarget = "";
  if (args.logo) {
    const ext = path.extname(args.logo).toLowerCase();
    if (![".svg", ".png"].includes(ext)) {
      throw new Error(`--logo must be an .svg or .png file (got "${args.logo}")`);
    }
    if (!fs.existsSync(args.logo)) {
      throw new Error(`Logo file not found: ${args.logo}`);
    }
    logoTarget = logoFileNameFor(spec.slug, ext);

    // Keep railway-template.json in step so the header generator finds the logo on later runs.
    const meta = JSON.parse(files.get("railway-template.json"));
    meta.logoFile = logoTarget;
    delete meta.customIcon;
    // The marketplace card renders `image` as a square icon, not a banner. The wide
    // template-header.svg (1280x270) looks broken there, so point at the actual logo instead.
    meta.image = `https://raw.githubusercontent.com/${spec.owner}/${spec.project}/main/${logoTarget}`;
    files.set("railway-template.json", `${JSON.stringify(meta, null, 2)}\n`);
  }

  return { spec, targetDir, files, logoTarget };
}

/**
 * @param {{ targetDir: string, files: Map<string, string>, logoTarget: string }} plan
 * @param {{ logo: string, force: boolean }} args
 */
function writeScaffold(plan, args) {
  const { targetDir, files, logoTarget } = plan;

  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0 && !args.force) {
    throw new Error(
      `Target directory is not empty: ${targetDir}. Pass --force to overwrite, ` +
        "but check first that you are not clobbering an existing template."
    );
  }

  for (const [relativePath, content] of files) {
    const filePath = path.join(targetDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    if (EXECUTABLE_FILES.includes(relativePath)) {
      fs.chmodSync(filePath, 0o755);
    }
  }

  if (logoTarget) {
    fs.copyFileSync(args.logo, path.join(targetDir, logoTarget));

    // Regenerate the banner now that the logo is in place, so it is inlined rather than replaced
    // by the fallback icon.
    const { svg, warnings } = buildBannerForRepo({
      repoPath: targetDir,
      title: plan.spec.displayName,
      subtitle: DEFAULT_SUBTITLE,
      logoFile: logoTarget,
    });
    for (const message of warnings) warn(message);
    fs.writeFileSync(path.join(targetDir, BANNER_FILENAME), svg, "utf8");

    const bytes = Buffer.byteLength(svg, "utf8");
    if (bytes > 20_000) {
      warn(
        `${BANNER_FILENAME} is ${Math.round(bytes / 1024)} KB because the logo is inlined as ` +
          "base64. Use an SVG or a logo of at most 256px to keep it small."
      );
    }
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  info(args.apply ? "Creating Railway template repository" : "Railway template scaffold (dry run)");

  const plan = planScaffold(args);

  for (const relativePath of plan.files.keys()) {
    progress(args.apply ? "[WRITE]" : "[DRY]", relativePath, "", args.apply ? "cyan" : "yellow");
  }
  if (plan.logoTarget) {
    progress(args.apply ? "[WRITE]" : "[DRY]", plan.logoTarget, "logo", args.apply ? "cyan" : "yellow");
  }

  if (args.apply) {
    writeScaffold(plan, args);
  }

  summaryBox(`Railway Template Scaffold: ${plan.spec.displayName}`, [
    `Repo: ${plan.spec.repo}`,
    `Target: ${plan.targetDir}`,
    `Published code: ${plan.spec.publishedCode ?? plan.spec.slug}`,
    `Description: ${plan.spec.description.length} chars`,
    `Port strategy: ${plan.spec.portStrategy}`,
    `Files: ${plan.files.size + (plan.logoTarget ? 1 : 0)}`,
    args.apply ? "Mode: applied" : "Mode: dry run (pass --apply to write)",
  ]);

  if (!plan.logoTarget) {
    warn(
      `No --logo passed, so the banner falls back to a generic mark. Look up the official logo ` +
        `(max 256px), save it as ${logoFileNameFor(plan.spec.slug, ".png")} in the repo and ` +
        "re-run `pnpm templates:headers`."
    );
  }

  warn(
    `The README deploy button still contains ${DEPLOY_CODE_PLACEHOLDER}. ` +
      "Replace it with the code Railway assigns after publishing."
  );
  success("Railway template scaffold completed");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

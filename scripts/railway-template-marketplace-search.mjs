#!/usr/bin/env node
/**
 * Batch-search the Railway public template marketplace (GraphQL `templates` connection).
 * Downloads the full catalog once (with optional disk cache), then ranks each query locally.
 *
 * Auth: RAILWAY_TOKEN, or token from ~/.railway/config.json (after `railway login`).
 *
 * Usage:
 *   node scripts/railway-template-marketplace-search.mjs
 *   node scripts/railway-template-marketplace-search.mjs Redis PostgreSQL
 *   node scripts/railway-template-marketplace-search.mjs --json --top 10
 *   node scripts/railway-template-marketplace-search.mjs --queries-file ./scripts/data/railway-marketplace-check-queries.json --refresh
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadRailwayDotenv } from "./load-railway-dotenv.mjs";
import {
  fetchAllMarketplaceTemplates,
  topMatches,
} from "./lib/railway-marketplace-search.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

loadRailwayDotenv(REPO_ROOT);

const DEFAULT_QUERIES_FILE = path.join(
  REPO_ROOT,
  "scripts",
  "data",
  "railway-marketplace-check-queries.json"
);

const DEFAULT_CACHE_FILE = path.join(REPO_ROOT, ".cache", "railway-marketplace-templates.json");

function loadRailwayToken() {
  if (process.env.RAILWAY_TOKEN) return process.env.RAILWAY_TOKEN;

  const configPath = path.join(os.homedir(), ".railway", "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(
      "No RAILWAY_TOKEN and no ~/.railway/config.json. Set RAILWAY_TOKEN or run `railway login`."
    );
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const token = parsed?.user?.token;
  if (!token) {
    throw new Error("No Railway token in ~/.railway/config.json (missing user.token).");
  }
  return token;
}

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const opts = {
    help: false,
    json: false,
    refresh: false,
    top: 5,
    queriesFile: DEFAULT_QUERIES_FILE,
    cacheFile: DEFAULT_CACHE_FILE,
    positional: [],
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
      continue;
    }
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "--refresh") {
      opts.refresh = true;
      continue;
    }
    if (arg.startsWith("--top=")) {
      opts.top = Number.parseInt(arg.slice("--top=".length), 10);
      continue;
    }
    if (arg.startsWith("--queries-file=")) {
      opts.queriesFile = path.resolve(arg.slice("--queries-file=".length));
      continue;
    }
    if (arg.startsWith("--cache-file=")) {
      opts.cacheFile = path.resolve(arg.slice("--cache-file=".length));
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    opts.positional.push(arg);
  }

  if (!Number.isFinite(opts.top) || opts.top < 1) {
    throw new Error("--top must be a positive integer");
  }

  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/railway-template-marketplace-search.mjs [options] [query ...]

Without positional queries, reads JSON array from --queries-file (default: scripts/data/railway-marketplace-check-queries.json).

Options:
  --json              Print machine-readable JSON (full result array)
  --top=N             Number of templates per query (default: 5)
  --queries-file=PATH JSON array of search strings
  --cache-file=PATH   Cache full template list (default: .cache/railway-marketplace-templates.json)
  --refresh           Ignore cache and refetch catalog
  -h, --help          Show this help

Environment:
  RAILWAY_TOKEN       Optional; otherwise uses ~/.railway/config.json from \`railway login\`
`);
}

/**
 * @param {{ fetchedAt: string, count: number, templates: import('./lib/railway-marketplace-search.mjs').RailwayMarketplaceTemplate[] }} cached
 */
function readCache(cacheFile) {
  if (!fs.existsSync(cacheFile)) return null;
  const raw = fs.readFileSync(cacheFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed?.templates || !Array.isArray(parsed.templates)) return null;
  return parsed;
}

/**
 * @param {string} cacheFile
 * @param {import('./lib/railway-marketplace-search.mjs').RailwayMarketplaceTemplate[]} templates
 */
function writeCache(cacheFile, templates) {
  const dir = path.dirname(cacheFile);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    fetchedAt: new Date().toISOString(),
    count: templates.length,
    templates,
  };
  fs.writeFileSync(cacheFile, JSON.stringify(payload));
}

/**
 * @param {ReturnType<parseArgs>} opts
 */
async function main(opts) {
  const token = loadRailwayToken();

  let templates;
  if (!opts.refresh) {
    const cached = readCache(opts.cacheFile);
    if (cached?.templates?.length) {
      templates = cached.templates;
      if (!opts.json) {
        console.error(
          `Using cache ${opts.cacheFile} (${cached.count} templates, ${cached.fetchedAt}). Use --refresh to refetch.`
        );
      }
    }
  }

  if (!templates) {
    if (!opts.json) console.error("Fetching marketplace templates from Railway GraphQL…");
    templates = await fetchAllMarketplaceTemplates(token, {
      pageSize: 250,
      onPage: (n, total) => {
        if (!opts.json) console.error(`  … ${total} templates`);
      },
    });
    writeCache(opts.cacheFile, templates);
    if (!opts.json) console.error(`Cached ${templates.length} templates → ${opts.cacheFile}`);
  }

  let queries = opts.positional;
  if (queries.length === 0) {
    if (!fs.existsSync(opts.queriesFile)) {
      throw new Error(`Queries file not found: ${opts.queriesFile}`);
    }
    const arr = JSON.parse(fs.readFileSync(opts.queriesFile, "utf8"));
    if (!Array.isArray(arr)) {
      throw new Error("queries file must contain a JSON array of strings");
    }
    queries = arr.map(String);
  }

  const results = queries.map((q) => {
    const { matches, resolvedQuery } = topMatches(templates, q, opts.top);
    return {
      query: q,
      resolvedQuery,
      top: matches.map((m) => ({
        score: m.score,
        id: m.template.id,
        name: m.template.name,
        code: m.template.code,
        description: m.template.description,
        category: m.template.category ?? null,
      })),
    };
  });

  if (opts.json) {
    console.log(JSON.stringify({ templateCount: templates.length, results }, null, 2));
    return;
  }

  for (const block of results) {
    console.log(`\n── ${block.query}${block.resolvedQuery !== block.query ? `  (→ ${block.resolvedQuery})` : ""}`);
    for (let i = 0; i < block.top.length; i++) {
      const row = block.top[i];
      console.log(
        `  ${i + 1}. [${row.score}] ${row.name}  (${row.code})  — ${(row.description || "").slice(0, 72)}${(row.description || "").length > 72 ? "…" : ""}`
      );
    }
  }
  console.log("");
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  printHelp();
  process.exit(0);
}

main(opts).catch((err) => {
  console.error(err.message || String(err));
  process.exit(1);
});

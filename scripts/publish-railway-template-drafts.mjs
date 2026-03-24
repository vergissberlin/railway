#!/usr/bin/env node

import { loadRailwayDotenv } from "./load-railway-dotenv.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { error, header, info, progress, success, summaryBox, table, warn } from "./misc-cli-utils.mjs";
import {
  formatRailwayGraphqlErrors,
  validateRailwayTemplatePublishDescription,
} from "./template-cli-lib.mjs";
import { getRailwayTemplateTargets } from "./railway-template-targets.mjs";

loadRailwayDotenv();

const GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";
const WORKSPACE_ID = "ae04726a-4471-430c-85e5-0bb2f83791fb";

const TARGETS = getRailwayTemplateTargets();

function parseArgs(argv) {
  const opts = { apply: false, verbose: false };
  // `pnpm run … -- --apply` may forward a standalone `--` to the script
  const args = argv.filter((a) => a !== "--");
  for (const arg of args) {
    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    if (arg === "--verbose" || arg === "-v") {
      opts.verbose = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/publish-railway-template-drafts.mjs [--apply] [--verbose]\n\n" +
          "See docs/railway-template-publish.md for API limits and troubleshooting."
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function getToken() {
  if (process.env.RAILWAY_TOKEN) return process.env.RAILWAY_TOKEN;
  const cfgPath = path.join(os.homedir(), ".railway", "config.json");
  const raw = fs.readFileSync(cfgPath, "utf8");
  const token = JSON.parse(raw)?.user?.token;
  if (!token) throw new Error("Missing Railway token. Run `railway login`.");
  return token;
}

function normalizeRepo(repo) {
  if (!repo || typeof repo !== "string") return "";
  return repo
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
}

function collectRepos(value, sink = new Set()) {
  if (!value || typeof value !== "object") return sink;
  if (Array.isArray(value)) {
    for (const item of value) collectRepos(item, sink);
    return sink;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === "repo" && typeof v === "string") {
      sink.add(normalizeRepo(v));
      continue;
    }
    collectRepos(v, sink);
  }
  return sink;
}

async function gql(token, query, variables = {}, verbose = false) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    const detail = formatRailwayGraphqlErrors(json.errors) || res.statusText;
    const err = new Error(detail);
    if (verbose && json.errors) {
      err.verbosePayload = json.errors;
    }
    throw err;
  }
  return json.data;
}

async function getWorkspaceTemplates(token, verbose) {
  const data = await gql(
    token,
    `query($workspaceId:String!){
      workspaceTemplates(workspaceId:$workspaceId, first:100){
        edges{ node { id name status code createdAt } }
      }
    }`,
    { workspaceId: WORKSPACE_ID },
    verbose
  );
  return (data.workspaceTemplates?.edges ?? []).map((e) => e.node);
}

async function getTemplateConfigRepos(token, templateId, verbose) {
  const data = await gql(
    token,
    `query($id:String!){ template(id:$id){ serializedConfig } }`,
    { id: templateId },
    verbose
  );
  return [...collectRepos(data.template?.serializedConfig)];
}

async function getTemplateCategoryFallback(token, verbose) {
  try {
    const data = await gql(
      token,
      `query($code:String!){ template(code:$code){ category } }`,
      { code: "apache-airflow" },
      verbose
    );
    return data.template?.category || "developer-tools";
  } catch {
    return "developer-tools";
  }
}

function readReadmeForProject(project) {
  const p = path.resolve(process.cwd(), project, "README.md");
  if (!fs.existsSync(p)) {
    return `# ${project}\n\nDeploy this template on Railway.`;
  }
  return fs.readFileSync(p, "utf8");
}

async function publishTemplate(token, templateId, input, verbose) {
  const data = await gql(
    token,
    `mutation($id:String!, $input:TemplatePublishInput!){
      templatePublish(id:$id, input:$input){
        id
        name
        status
        code
      }
    }`,
    { id: templateId, input },
    verbose
  );
  return data.templatePublish;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  header("Railway Draft Publish", "Publish generated template drafts", "bgBlue");
  info(`Mode: ${opts.apply ? "APPLY" : "DRY-RUN"}`);

  const token = getToken();
  const category = await getTemplateCategoryFallback(token, opts.verbose);
  info(`Category: ${category}`);

  const templates = await getWorkspaceTemplates(token, opts.verbose);
  for (const t of templates) {
    t.repos = t.status === "UNPUBLISHED" ? await getTemplateConfigRepos(token, t.id, opts.verbose) : [];
  }

  const actions = [];
  for (const target of TARGETS) {
    const matches = templates
      .filter((t) => t.status === "UNPUBLISHED" && t.repos.includes(normalizeRepo(target.repo)))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const draft = matches[0];
    actions.push({
      target,
      draft,
      ready: Boolean(draft),
      reason: draft ? "ready" : "missing draft",
    });
  }

  table(
    ["Project", "Repo", "Draft", "Code", "State"],
    actions.map((a) => [
      a.target.project,
      a.target.repo,
      a.draft?.name ?? "-",
      a.draft?.code ?? "-",
      a.reason,
    ])
  );

  let published = 0;
  let skipped = 0;
  let failed = 0;

  for (const action of actions) {
    if (!action.ready) {
      skipped += 1;
      progress("[SKIP]", action.target.project, "no draft found", "yellow");
      continue;
    }

    if (!opts.apply) {
      skipped += 1;
      progress("[DRY]", action.target.project, `would publish ${action.draft.id}`, "yellow");
      continue;
    }

    try {
      const descResult = validateRailwayTemplatePublishDescription(action.target.description);
      if (!descResult.ok) {
        throw new Error(descResult.error);
      }
      for (const w of descResult.warnings) {
        warn(`${action.target.project}: ${w}`);
      }
      const readme = readReadmeForProject(action.target.project);
      const payload = {
        workspaceId: WORKSPACE_ID,
        category,
        description: descResult.value,
        image: action.target.image,
        readme,
      };
      const result = await publishTemplate(token, action.draft.id, payload, opts.verbose);
      published += 1;
      progress("[OK]", action.target.project, `published (${result.code})`, "green");
    } catch (err) {
      failed += 1;
      progress("[ERR]", action.target.project, err.message, "red");
      if (opts.verbose && err.verbosePayload) {
        console.error(JSON.stringify(err.verbosePayload, null, 2));
      }
      if (
        err.message.includes("Problem processing request") ||
        err.message.includes("blocked from publishing templates")
      ) {
        warn(
          "Railway rejected templatePublish. This is often a platform-side rule or transient backend error. " +
            "Open docs/railway-template-publish.md and include traceId in a Railway support ticket if it persists."
        );
      }
    }
  }

  summaryBox("Publish Summary", [
    `Apply mode: ${opts.apply ? "yes" : "no"}`,
    `Published: ${published}`,
    `Skipped: ${skipped}`,
    `Failed: ${failed}`,
  ]);

  if (failed > 0) {
    warn("One or more drafts could not be published.");
    process.exitCode = 1;
    return;
  }
  success("Draft publish flow completed.");
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});

#!/usr/bin/env node

import { loadRailwayDotenv } from "./load-railway-dotenv.mjs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { error, header, info, progress, success, summaryBox, table, warn } from "./misc-cli-utils.mjs";
import {
  findWorkspaceProjectByName,
  getRailwayTemplateTargets,
  workspaceProjectMatchCandidatesFromMeta,
} from "./railway-template-targets.mjs";

loadRailwayDotenv();

const RAILWAY_GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";
const DEFAULT_WORKSPACE_ID = "ae04726a-4471-430c-85e5-0bb2f83791fb";

const TARGETS = getRailwayTemplateTargets().map((t) => ({
  key: t.project.replace(/^railwayapp-/, ""),
  projectName: t.project,
  repo: t.repo,
  desiredName: t.displayName,
  meta: t,
}));

function parseArgs(argv) {
  const opts = {
    apply: false,
    recreateMissing: false,
    workspaceId: DEFAULT_WORKSPACE_ID,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
      continue;
    }
    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    if (arg === "--recreate-missing") {
      opts.recreateMissing = true;
      continue;
    }
    if (arg.startsWith("--workspace-id=")) {
      opts.workspaceId = arg.slice("--workspace-id=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/sync-railway-template-drafts.mjs [options]

Options:
  --apply                Apply destructive actions (delete + generate)
  --recreate-missing     Try to generate missing drafts via templateGenerate
  --workspace-id=<id>    Railway workspace ID (default: ${DEFAULT_WORKSPACE_ID})
  --help, -h             Show this help
`);
}

function loadRailwayToken() {
  if (process.env.RAILWAY_TOKEN) return process.env.RAILWAY_TOKEN;

  const configPath = path.join(os.homedir(), ".railway", "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("Railway config not found. Run `railway login` first.");
  }
  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw);
  const token = parsed?.user?.token;
  if (!token) {
    throw new Error("No Railway token found in ~/.railway/config.json");
  }
  return token;
}

async function gql(token, query, variables = {}) {
  const payload = { query, variables };
  const res = await fetch(RAILWAY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Railway API request failed: ${res.status} ${res.statusText} | ${body}`);
  }

  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(data.errors.map((e) => e.message).join(" | "));
  }
  return data.data;
}

/** @param {string} repo */
function normalizeRepo(repo) {
  if (!repo || typeof repo !== "string") return "";
  return repo
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
}

/**
 * @param {{ repos?: string[] }} template
 * @param {string} targetRepoNorm
 */
function templateMatchesTargetRepo(template, targetRepoNorm) {
  const repos = (template.repos ?? []).map(normalizeRepo).filter(Boolean);
  return repos.includes(targetRepoNorm);
}

async function fetchWorkspaceTemplates(token, workspaceId) {
  const query = `
    query($workspaceId: String!) {
      workspaceTemplates(workspaceId: $workspaceId, first: 100) {
        edges {
          node {
            id
            name
            status
            code
            createdAt
          }
        }
      }
    }
  `;
  const data = await gql(token, query, { workspaceId });
  return (data.workspaceTemplates?.edges ?? []).map((edge) => edge.node);
}

function collectReposFromConfig(value, sink = new Set()) {
  if (!value || typeof value !== "object") return sink;
  if (Array.isArray(value)) {
    for (const item of value) collectReposFromConfig(item, sink);
    return sink;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === "repo" && typeof v === "string" && v.includes("/")) {
      sink.add(v.trim());
      continue;
    }
    collectReposFromConfig(v, sink);
  }
  return sink;
}

async function fetchTemplateRepos(token, templateId) {
  const query = `
    query($id: String!) {
      template(id: $id) {
        serializedConfig
      }
    }
  `;
  const data = await gql(token, query, { id: templateId });
  const cfg = data?.template?.serializedConfig;
  return [...collectReposFromConfig(cfg)];
}

async function fetchWorkspaceProjects(token, workspaceId) {
  const query = `
    query($workspaceId: String!) {
      projects(workspaceId: $workspaceId, first: 100) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  const data = await gql(token, query, { workspaceId });
  return (data.projects?.edges ?? []).map((edge) => edge.node);
}

async function deleteTemplate(token, workspaceId, templateId) {
  const mutation = `
    mutation($id: String!, $workspaceId: String!) {
      templateDelete(id: $id, input: { workspaceId: $workspaceId })
    }
  `;
  await gql(token, mutation, { id: templateId, workspaceId });
}

async function generateTemplate(token, projectId) {
  const mutation = `
    mutation($input: TemplateGenerateInput!) {
      templateGenerate(input: $input) {
        id
        name
        code
        status
      }
    }
  `;
  const data = await gql(token, mutation, { input: { projectId } });
  return data.templateGenerate;
}

function buildRows(targets, templates) {
  return targets.map((target) => {
    const targetRepoNorm = normalizeRepo(target.repo);
    const forRepo = templates.filter((t) => templateMatchesTargetRepo(t, targetRepoNorm));
    const unpublished = forRepo
      .filter((t) => t.status === "UNPUBLISHED")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const published = forRepo
      .filter((t) => t.status === "PUBLISHED")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const newestUnpublished = unpublished[0] ?? null;
    const newestPublished = published[0] ?? null;
    const primary = newestUnpublished ?? newestPublished ?? null;

    let state;
    if (newestUnpublished) state = "draft";
    else if (newestPublished) state = "published";
    else state = "missing";

    return {
      target,
      /** Unpublished only — used for duplicate deletion */
      matches: unpublished,
      newest: primary,
      state,
    };
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  header("Railway Draft Sync", "Detect, cleanup, and recreate template drafts", "bgBlue");
  info(`Mode: ${opts.apply ? "APPLY" : "DRY-RUN"}`);
  info(`Workspace: ${opts.workspaceId}`);

  const token = loadRailwayToken();

  const templates = await fetchWorkspaceTemplates(token, opts.workspaceId);
  for (const template of templates) {
    try {
      template.repos = await fetchTemplateRepos(token, template.id);
    } catch {
      template.repos = [];
    }
  }
  const projects = await fetchWorkspaceProjects(token, opts.workspaceId);
  const rows = buildRows(TARGETS, templates);

  table(
    ["Target", "Repo", "State", "Template", "Code"],
    rows.map((r) => [
      r.target.desiredName,
      r.target.repo,
      r.state,
      r.newest?.name ?? "-",
      r.newest?.code ?? "-",
    ])
  );

  const missingCount = rows.filter((r) => r.state === "missing").length;
  if (missingCount > 0 && (!opts.apply || !opts.recreateMissing)) {
    info(
      "Missing drafts are not created unless you pass --recreate-missing (and --apply to run templateGenerate). Example: pnpm run templates:sync:apply"
    );
  }

  for (const row of rows) {
    if (row.matches.length <= 1) continue;

    const keepId = row.newest.id;
    for (const duplicate of row.matches) {
      if (duplicate.id === keepId) continue;
      if (!opts.apply) {
        progress("[DRY]", row.target.repo, `would delete duplicate ${duplicate.name} (${duplicate.id})`, "yellow");
        continue;
      }
      await deleteTemplate(token, opts.workspaceId, duplicate.id);
      progress("[DEL]", row.target.repo, `deleted duplicate ${duplicate.name}`, "green");
    }
  }

  if (opts.recreateMissing) {
    for (const row of rows) {
      if (row.state !== "missing") continue;

      const project = findWorkspaceProjectByName(projects, row.target.meta);
      if (!project) {
        const tried =
          workspaceProjectMatchCandidatesFromMeta(row.target.meta).join(", ") || "(no candidates)";
        warn(`Project not found for ${row.target.projectName} (tried: ${tried})`);
        continue;
      }

      if (!opts.apply) {
        progress("[DRY]", row.target.repo, `would generate draft from project ${project.id}`, "yellow");
        continue;
      }

      try {
        const created = await generateTemplate(token, project.id);
        progress("[NEW]", row.target.repo, `created ${created.name} (${created.code})`, "green");
      } catch (err) {
        progress("[ERR]", row.target.repo, `generate failed: ${err.message}`, "red");
      }
    }
  }

  const updated = await fetchWorkspaceTemplates(token, opts.workspaceId);
  for (const template of updated) {
    try {
      template.repos = await fetchTemplateRepos(token, template.id);
    } catch {
      template.repos = [];
    }
  }
  const finalRows = buildRows(TARGETS, updated);
  const mappedCount = finalRows.filter((r) => r.state !== "missing").length;

  summaryBox("Draft Summary", [
    `Workspace: ${opts.workspaceId}`,
    `Targets: ${TARGETS.length}`,
    `Mapped (draft or published): ${mappedCount}`,
    `Missing: ${TARGETS.length - mappedCount}`,
    `Applied: ${opts.apply ? "yes" : "no (dry-run)"}`,
    `Recreate missing: ${opts.recreateMissing ? "yes" : "no"}`,
  ]);

  if (mappedCount === TARGETS.length) {
    success("Each target repo has a workspace template (unpublished draft or published).");
  } else {
    warn("Some target repos still have no matching template.");
  }
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});

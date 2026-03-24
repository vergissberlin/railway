#!/usr/bin/env node

import { loadRailwayDotenv } from "./load-railway-dotenv.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { error, header, info, success, summaryBox, table, warn } from "./misc-cli-utils.mjs";
import { getRailwayTemplateTargets } from "./railway-template-targets.mjs";

loadRailwayDotenv();

const GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";
const WORKSPACE_ID = "ae04726a-4471-430c-85e5-0bb2f83791fb";

const TARGETS = getRailwayTemplateTargets().map((t) => ({
  projectName: t.project,
  repo: t.repo,
  publishedCode: t.publishedCode,
}));

function parseArgs(argv) {
  const opts = { json: false };
  const args = argv.filter((a) => a !== "--");
  for (const arg of args) {
    if (arg === "--json") {
      opts.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/verify-railway-template-drafts.mjs [--json]");
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function getToken() {
  if (process.env.RAILWAY_TOKEN) return process.env.RAILWAY_TOKEN;
  const configPath = path.join(os.homedir(), ".railway", "config.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw).user.token;
}

async function gql(token, query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    const detail = json.errors?.map((e) => e.message).join(" | ") ?? res.statusText;
    throw new Error(detail);
  }
  return json.data;
}

function collectRepos(value, sink = new Set()) {
  if (!value || typeof value !== "object") return sink;
  if (Array.isArray(value)) {
    for (const item of value) collectRepos(item, sink);
    return sink;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === "repo" && typeof v === "string") {
      sink.add(v.trim());
      continue;
    }
    collectRepos(v, sink);
  }
  return sink;
}

function normalizeRepo(repo) {
  if (!repo || typeof repo !== "string") return "";
  return repo
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.json) {
    header("Railway Draft Verify", "Validate source + drafts + codes", "bgBlue");
  }
  const token = getToken();

  const projectsData = await gql(
    token,
    `query($workspaceId:String!){
      projects(workspaceId:$workspaceId, first:100){
        edges{
          node{
            id
            name
            environments(first:5){
              edges{
                node{
                  id
                  name
                  serviceInstances(first:50){
                    edges{
                      node{
                        serviceId
                        serviceName
                        source { repo image }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { workspaceId: WORKSPACE_ID }
  );

  const templatesData = await gql(
    token,
    `query($workspaceId:String!){
      workspaceTemplates(workspaceId:$workspaceId, first:100){
        edges{
          node{
            id
            name
            status
            code
            createdAt
          }
        }
      }
    }`,
    { workspaceId: WORKSPACE_ID }
  );

  const templates = (templatesData.workspaceTemplates.edges ?? []).map((e) => e.node);
  for (const tpl of templates) {
    try {
      const d = await gql(token, `query($id:String!){ template(id:$id){ serializedConfig } }`, { id: tpl.id });
      tpl.repos = [...collectRepos(d.template.serializedConfig)];
    } catch {
      tpl.repos = [];
    }
  }

  const rows = [];
  const jsonRows = [];
  let passCount = 0;

  for (const t of TARGETS) {
    const repoNorm = normalizeRepo(t.repo);
    let p = null;
    for (const edge of projectsData.projects.edges ?? []) {
      const node = edge.node;
      for (const envEdge of node.environments?.edges ?? []) {
        for (const siEdge of envEdge.node.serviceInstances?.edges ?? []) {
          if (normalizeRepo(siEdge.node?.source?.repo ?? "") === repoNorm) {
            p = node;
            break;
          }
        }
        if (p) break;
      }
      if (p) break;
    }
    const env = p?.environments?.edges?.find((e) => e.node.name === "production")?.node ?? p?.environments?.edges?.[0]?.node;
    const instance = env?.serviceInstances?.edges?.find((e) => e.node.serviceName === t.projectName)?.node ?? env?.serviceInstances?.edges?.[0]?.node;
    const sourceRepo = normalizeRepo(instance?.source?.repo ?? "");

    const forRepo = templates.filter((x) => (x.repos ?? []).map(normalizeRepo).includes(repoNorm));

    const draftMatches = forRepo
      .filter((x) => x.status === "UNPUBLISHED")
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const publishedMatches = forRepo.filter((x) => x.status === "PUBLISHED");

    const draftCount = draftMatches.length;
    const publishedCount = publishedMatches.length;
    const activeDraft = draftMatches[0];
    const activePublished = publishedMatches[0];

    const draftCode = activeDraft?.code ?? "-";
    const publishedCode = activePublished?.code ?? "-";

    const sourceOk = sourceRepo === repoNorm;
    /** One unpublished draft, or exactly one published template (no duplicate repo rows). */
    const draftOk =
      (draftCount === 1 && publishedCount === 0) || (draftCount === 0 && publishedCount === 1);
    const codeOk =
      publishedCount === 1
        ? publishedCode === t.publishedCode
        : draftCount === 1;
    const allOk = sourceOk && draftOk && codeOk;
    if (allOk) passCount += 1;

    const codeLabel =
      publishedCount === 1 ? `${publishedCode} (published)` : draftCode === "-" ? "-" : `${draftCode} (draft)`;

    jsonRows.push({
      project: t.projectName,
      source: sourceOk ? "ok" : "bad",
      draft: draftOk ? "ok" : `drafts=${draftCount} published=${publishedCount}`,
      code: codeOk ? "ok" : `${codeLabel} (exp published ${t.publishedCode} or one draft)`,
      ok: allOk,
      expectedPublishedCode: t.publishedCode,
      actualDraftCode: draftCode,
      actualPublishedCode: publishedCode,
      sourceRepo,
    });

    rows.push([
      t.projectName,
      sourceOk ? "ok" : "bad",
      draftOk ? "ok" : `drafts=${draftCount} pub=${publishedCount}`,
      codeOk ? "ok" : `mismatch (${codeLabel})`,
    ]);
  }

  const result = {
    workspaceId: WORKSPACE_ID,
    targets: TARGETS.length,
    passed: passCount,
    failed: TARGETS.length - passCount,
    ok: passCount === TARGETS.length,
    checks: jsonRows,
  };

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    info(`Workspace: ${WORKSPACE_ID}`);
    table(["Project", "Source", "Draft", "Code"], rows);

    summaryBox("Verify Summary", [
      `Targets: ${TARGETS.length}`,
      `Passed: ${passCount}`,
      `Failed: ${TARGETS.length - passCount}`,
    ]);

    if (result.ok) {
      success("All Railway template draft checks passed.");
      return;
    }
    warn("Some checks failed. Re-run source/draft sync if needed.");
  }
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});

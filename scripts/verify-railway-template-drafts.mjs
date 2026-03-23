#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { error, header, info, success, summaryBox, table, warn } from "./misc-cli-utils.mjs";

const GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";
const WORKSPACE_ID = "ae04726a-4471-430c-85e5-0bb2f83791fb";

const TARGETS = [
  { projectName: "railwayapp-homeassistant", repo: "vergissberlin/railwayapp-homeassistant", expectedCode: "h29RRq" },
  { projectName: "railwayapp-email", repo: "vergissberlin/railwayapp-email", expectedCode: "vs5SQO" },
  { projectName: "railwayapp-gitlab", repo: "vergissberlin/railwayapp-gitlab", expectedCode: "fR9w2h" },
  { projectName: "railwayapp-opensearch", repo: "vergissberlin/railwayapp-opensearch", expectedCode: "T1QKjt" },
];

function parseArgs(argv) {
  const opts = { json: false };
  for (const arg of argv) {
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

  const projects = new Map((projectsData.projects.edges ?? []).map((e) => [e.node.name, e.node]));
  const rows = [];
  const jsonRows = [];
  let passCount = 0;

  for (const t of TARGETS) {
    const p = projects.get(t.projectName);
    const env = p?.environments?.edges?.find((e) => e.node.name === "production")?.node ?? p?.environments?.edges?.[0]?.node;
    const instance = env?.serviceInstances?.edges?.find((e) => e.node.serviceName === t.projectName)?.node ?? env?.serviceInstances?.edges?.[0]?.node;
    const sourceRepo = normalizeRepo(instance?.source?.repo ?? "");

    const draftMatches = templates
      .filter((x) => {
        const repos = (x.repos ?? []).map(normalizeRepo);
        return x.status === "UNPUBLISHED" && repos.includes(normalizeRepo(t.repo));
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const draftCount = draftMatches.length;
    const activeDraft = draftMatches[0];
    const draftCode = activeDraft?.code ?? "-";

    const sourceOk = sourceRepo === normalizeRepo(t.repo);
    const draftOk = draftCount === 1;
    const codeOk = draftCode === t.expectedCode;
    const allOk = sourceOk && draftOk && codeOk;
    if (allOk) passCount += 1;

    jsonRows.push({
      project: t.projectName,
      source: sourceOk ? "ok" : "bad",
      draft: draftOk ? "ok" : `count=${draftCount}`,
      code: codeOk ? "ok" : `${draftCode} (exp ${t.expectedCode})`,
      ok: allOk,
      expectedCode: t.expectedCode,
      actualCode: draftCode,
      sourceRepo,
    });

    rows.push([
      t.projectName,
      sourceOk ? "ok" : "bad",
      draftOk ? "ok" : `count=${draftCount}`,
      codeOk ? "ok" : `${draftCode} (exp ${t.expectedCode})`,
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

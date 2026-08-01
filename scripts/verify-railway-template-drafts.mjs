#!/usr/bin/env node

import { loadRailwayDotenv } from "./load-railway-dotenv.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { error, header, info, success, summaryBox, table, warn } from "./misc-cli-utils.mjs";
import { getRailwayTemplateTargets } from "./railway-template-targets.mjs";
import {
  buildVerifyResult,
  collectRepos,
  formatVerifyFailures,
} from "./lib/railway-draft-verify.mjs";

loadRailwayDotenv();

const GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";
const WORKSPACE_ID = "ae04726a-4471-430c-85e5-0bb2f83791fb";

const TARGETS = getRailwayTemplateTargets().map((t) => ({
  project: t.project,
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

  const result = buildVerifyResult(TARGETS, projectsData.projects.edges ?? [], templates, WORKSPACE_ID);

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
    // stdout is the report file in CI, so the reason has to go to stderr to reach the run log.
    const failures = formatVerifyFailures(result);
    if (failures.length) {
      console.error(`::error::${failures[0]}`);
      for (const line of failures.slice(1)) console.error(line);
    }
  } else {
    info(`Workspace: ${WORKSPACE_ID}`);
    table(
      ["Project", "Source", "Draft", "Code"],
      result.checks.map((c) => [
        c.project,
        c.source,
        c.draft === "ok" ? "ok" : c.draft.replace("published=", "pub="),
        c.code === "ok" ? "ok" : `mismatch (${c.code})`,
      ])
    );

    summaryBox("Verify Summary", [
      `Targets: ${result.targets}`,
      `Passed: ${result.passed}`,
      `Failed: ${result.failed}`,
    ]);

    if (result.ok) {
      success("All Railway template draft checks passed.");
      return;
    }
    for (const line of formatVerifyFailures(result).slice(1)) warn(line);
    warn("Some checks failed. Re-run source/draft sync if needed.");
  }
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});

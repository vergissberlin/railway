#!/usr/bin/env node
/**
 * Renames Railway projects to friendly software names and recreates each template so the
 * marketplace title matches (Railway derives the template name from the project at templateGenerate time).
 *
 * Flow per target: projectUpdate → unpublish/delete existing template → serviceConnect →
 * templateGenerate → templatePublish (same metadata as publish-railway-template-drafts.mjs).
 *
 * Usage: node scripts/apply-railway-template-display-names.mjs [--apply] [--verbose] [--only=<projectFolder>]
 */

import fs from "node:fs";
import path from "node:path";
import { loadRailwayDotenv } from "./load-railway-dotenv.mjs";
import { error, header, info, progress, success, summaryBox, table, warn } from "./misc-cli-utils.mjs";
import { getRailwayTemplateTargets } from "./railway-template-targets.mjs";
import {
  formatRailwayGraphqlErrors,
  validateRailwayTemplatePublishDescription,
} from "./template-cli-lib.mjs";

loadRailwayDotenv();

const GRAPHQL_URL = "https://backboard.railway.app/graphql/v2";
const WORKSPACE_ID = "ae04726a-4471-430c-85e5-0bb2f83791fb";
const SOURCE_BRANCH = "main";

function parseArgs(argv) {
  const opts = { apply: false, verbose: false, only: null };
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
    if (arg.startsWith("--only=")) {
      opts.only = arg.slice("--only=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/apply-railway-template-display-names.mjs [--apply] [--verbose] [--only=railwayapp-email]"
      );
      process.exit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
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
    if (verbose && json.errors) err.verbosePayload = json.errors;
    throw err;
  }
  return json.data;
}

function getToken() {
  if (process.env.RAILWAY_TOKEN) return process.env.RAILWAY_TOKEN;
  throw new Error("Missing RAILWAY_TOKEN (.env or environment).");
}

async function fetchWorkspaceProjects(token, verbose) {
  return gql(
    token,
    `query($workspaceId:String!){
      projects(workspaceId:$workspaceId, first:100){
        edges{
          node{
            id
            name
            updatedAt
            environments(first:5){
              edges{
                node{
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
    { workspaceId: WORKSPACE_ID },
    verbose
  );
}

function findProjectForRepo(data, repoNorm) {
  const matches = [];
  for (const edge of data.projects?.edges ?? []) {
    const node = edge.node;
    for (const envEdge of node.environments?.edges ?? []) {
      for (const siEdge of envEdge.node.serviceInstances?.edges ?? []) {
        const n = siEdge.node;
        const r = normalizeRepo(n?.source?.repo ?? "");
        if (r === repoNorm) {
          matches.push({
            projectId: node.id,
            projectName: node.name,
            updatedAt: node.updatedAt,
            serviceId: n.serviceId,
            serviceName: n.serviceName,
          });
        }
      }
    }
  }
  matches.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return matches[0] ?? null;
}

async function fetchWorkspaceTemplatesWithRepos(token, verbose) {
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
  const nodes = (data.workspaceTemplates?.edges ?? []).map((e) => e.node);
  for (const t of nodes) {
    const d = await gql(token, `query($id:String!){ template(id:$id){ serializedConfig } }`, { id: t.id }, verbose);
    t.repos = [...collectRepos(d.template?.serializedConfig)];
  }
  return nodes;
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

function readReadmeForProject(projectFolder) {
  const p = path.resolve(process.cwd(), projectFolder, "README.md");
  if (!fs.existsSync(p)) {
    return `# ${projectFolder}\n\nDeploy this template on Railway.`;
  }
  return fs.readFileSync(p, "utf8");
}

async function projectUpdateName(token, projectId, name, verbose) {
  return gql(
    token,
    `mutation($id:String!,$input:ProjectUpdateInput!){ projectUpdate(id:$id,input:$input){ id name } }`,
    { id: projectId, input: { name } },
    verbose
  );
}

async function serviceConnectRepo(token, serviceId, repo, verbose) {
  return gql(
    token,
    `mutation($id:String!,$input:ServiceConnectInput!){ serviceConnect(id:$id,input:$input){ id } }`,
    { id: serviceId, input: { repo, branch: SOURCE_BRANCH } },
    verbose
  );
}

async function templateUnpublish(token, templateId, verbose) {
  return gql(token, `mutation($id:String!){ templateUnpublish(id:$id) }`, { id: templateId }, verbose);
}

async function templateDelete(token, templateId, verbose) {
  return gql(
    token,
    `mutation($id:String!,$w:String!){ templateDelete(id:$id,input:{workspaceId:$w}) }`,
    { id: templateId, w: WORKSPACE_ID },
    verbose
  );
}

async function templateGenerateFromProject(token, projectId, verbose) {
  return gql(
    token,
    `mutation($input:TemplateGenerateInput!){ templateGenerate(input:$input){ id name status code } }`,
    { input: { projectId } },
    verbose
  );
}

async function templatePublish(token, templateId, input, verbose) {
  return gql(
    token,
    `mutation($id:String!,$input:TemplatePublishInput!){
      templatePublish(id:$id, input:$input){ id name status code }
    }`,
    { id: templateId, input },
    verbose
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  header("Railway template display names", "Rename projects + recreate templates", "bgBlue");
  info(`Mode: ${opts.apply ? "APPLY" : "DRY-RUN"}`);

  const token = getToken();
  const category = await getTemplateCategoryFallback(token, opts.verbose);
  info(`Category: ${category}`);

  const projectsData = await fetchWorkspaceProjects(token, opts.verbose);
  let templates = await fetchWorkspaceTemplatesWithRepos(token, opts.verbose);

  let targets = getRailwayTemplateTargets();
  if (opts.only) {
    targets = targets.filter((t) => t.project === opts.only);
    if (!targets.length) throw new Error(`No target for --only=${opts.only}`);
  }

  const rows = [];
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const target of targets) {
    const repoNorm = normalizeRepo(target.repo);
    const hit = findProjectForRepo(projectsData, repoNorm);
    const tplMatches = templates
      .filter((t) => (t.repos ?? []).map(normalizeRepo).includes(repoNorm))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const already =
      hit &&
      tplMatches.length === 1 &&
      tplMatches[0].status === "PUBLISHED" &&
      tplMatches[0].name === target.displayName &&
      tplMatches[0].code === target.publishedCode;

    rows.push([
      target.project,
      target.displayName,
      hit ? hit.projectName : "—",
      tplMatches[0]?.name ?? "—",
      tplMatches[0]?.code ?? "—",
      already ? "skip (ok)" : opts.apply ? "run" : "would run",
    ]);

    if (already) {
      skipped += 1;
      progress("[SKIP]", target.project, "already matches display name + published code", "green");
      continue;
    }

    if (!hit) {
      failed += 1;
      progress("[ERR]", target.project, "no project with matching GitHub repo on service source", "red");
      continue;
    }

    if (!opts.apply) {
      skipped += 1;
      progress("[DRY]", target.project, `would rename → ${target.displayName} and recreate template`, "yellow");
      continue;
    }

    try {
      await projectUpdateName(token, hit.projectId, target.displayName, opts.verbose);
      progress("[OK]", target.project, `project renamed to "${target.displayName}"`, "green");

      for (const tpl of tplMatches) {
        if (tpl.status === "PUBLISHED") {
          await templateUnpublish(token, tpl.id, opts.verbose);
        }
        await templateDelete(token, tpl.id, opts.verbose);
      }

      await serviceConnectRepo(token, hit.serviceId, target.repo, opts.verbose);
      const gen = await templateGenerateFromProject(token, hit.projectId, opts.verbose);
      progress("[OK]", target.project, `draft "${gen.templateGenerate.name}" (${gen.templateGenerate.code})`, "green");

      const descResult = validateRailwayTemplatePublishDescription(target.description);
      if (!descResult.ok) throw new Error(descResult.error);
      const readme = readReadmeForProject(target.project);
      const pubIn = {
        workspaceId: WORKSPACE_ID,
        category,
        description: descResult.value,
        image: target.image,
        readme,
      };
      const pub = await templatePublish(token, gen.templateGenerate.id, pubIn, opts.verbose);
      progress("[OK]", target.project, `published code=${pub.templatePublish.code} name=${pub.templatePublish.name}`, "green");
      ok += 1;

      templates = await fetchWorkspaceTemplatesWithRepos(token, opts.verbose);
    } catch (e) {
      failed += 1;
      error(`${target.project}: ${e.message}`);
      if (opts.verbose && e.verbosePayload) console.error(JSON.stringify(e.verbosePayload, null, 2));
    }
  }

  table(["Project", "Display name", "Project (before)", "Template name", "Code", "Action"], rows);
  summaryBox("Display name refresh", [
    `Apply: ${opts.apply ? "yes" : "no"}`,
    `Applied OK: ${ok}`,
    `Skipped: ${skipped}`,
    `Failed: ${failed}`,
  ]);

  if (failed > 0) {
    warn("One or more targets failed.");
    process.exitCode = 1;
    return;
  }
  success("Done.");
}

main().catch((err) => {
  error(err.message);
  process.exit(1);
});

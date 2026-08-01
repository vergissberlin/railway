/**
 * Pure evaluation logic behind `scripts/verify-railway-template-drafts.mjs`.
 *
 * The CLI does the Railway GraphQL calls; everything that decides pass/fail lives here so it can
 * be tested without workspace access (the Railway API is unreachable from CI test jobs, which run
 * without RAILWAY_TOKEN).
 *
 * @typedef {Object} ServiceInstanceNode
 * @property {string} [serviceId]
 * @property {string} [serviceName]
 * @property {{ repo?: string, image?: string } | null} [source]
 *
 * @typedef {Object} RepoServiceMatch
 * @property {string} projectName Railway project holding the matched service
 * @property {string} environmentName environment the match was found in
 * @property {string} serviceName matched service
 * @property {string} repo normalized repo of the matched service
 */

/** @param {unknown} repo */
export function normalizeRepo(repo) {
  if (!repo || typeof repo !== "string") return "";
  return repo
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
}

/**
 * Railway's `serializedConfig` nests service definitions at varying depths, so repos are collected
 * by walking the whole structure rather than by a fixed path.
 * @param {unknown} value
 * @param {Set<string>} [sink]
 * @returns {Set<string>}
 */
export function collectRepos(value, sink = new Set()) {
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

/**
 * Finds the service instance that actually deploys `repo`.
 *
 * The instance is returned as found. Re-deriving it afterwards — by service name, with a fallback
 * to the first instance of the environment — reports `source=bad` for any project whose repo
 * service is neither named after the target nor listed first (a project with an attached database
 * puts an image-only service in that slot), even though a matching service demonstrably exists.
 *
 * `production` wins when several environments deploy the same repo, because that is the
 * environment the published template is generated from.
 *
 * @param {Array<{ node?: { name?: string, environments?: { edges?: Array<{ node?: { name?: string, serviceInstances?: { edges?: Array<{ node?: ServiceInstanceNode }> } } }> } } }>} projectEdges
 * @param {string} repo target repo, `owner/name` or a GitHub URL
 * @returns {RepoServiceMatch | null}
 */
export function findRepoServiceMatch(projectEdges, repo) {
  const wanted = normalizeRepo(repo);
  if (!wanted) return null;

  /** @type {RepoServiceMatch[]} */
  const matches = [];
  for (const projectEdge of projectEdges ?? []) {
    const project = projectEdge?.node;
    if (!project) continue;
    for (const envEdge of project.environments?.edges ?? []) {
      const environment = envEdge?.node;
      if (!environment) continue;
      for (const instanceEdge of environment.serviceInstances?.edges ?? []) {
        const instance = instanceEdge?.node;
        if (!instance) continue;
        if (normalizeRepo(instance.source?.repo ?? "") !== wanted) continue;
        matches.push({
          projectName: project.name ?? "",
          environmentName: environment.name ?? "",
          serviceName: instance.serviceName ?? "",
          repo: wanted,
        });
      }
    }
  }

  if (matches.length === 0) return null;
  return matches.find((m) => m.environmentName === "production") ?? matches[0];
}

/**
 * @typedef {Object} VerifyCheck
 * @property {string} project
 * @property {string} repo normalized target repo
 * @property {"ok" | "bad"} source
 * @property {string} draft `"ok"` or the offending counts
 * @property {string} code `"ok"` or the offending code
 * @property {boolean} ok
 * @property {string} expectedPublishedCode
 * @property {string} actualDraftCode
 * @property {string} actualPublishedCode
 * @property {string} sourceRepo
 * @property {string} railwayProject Railway project the repo service was found in
 * @property {string} railwayEnvironment environment the repo service was found in
 * @property {string} railwayService matched service name
 */

/**
 * @param {{ project: string, repo: string, publishedCode: string }} target
 * @param {unknown[]} projectEdges
 * @param {Array<{ status?: string, code?: string, createdAt?: string, repos?: string[] }>} templates
 * @returns {VerifyCheck}
 */
export function evaluateTarget(target, projectEdges, templates) {
  const repoNorm = normalizeRepo(target.repo);
  const match = findRepoServiceMatch(/** @type {never} */ (projectEdges), target.repo);

  const forRepo = (templates ?? []).filter((t) =>
    (t.repos ?? []).map(normalizeRepo).includes(repoNorm)
  );
  const draftMatches = forRepo
    .filter((t) => t.status === "UNPUBLISHED")
    .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
  const publishedMatches = forRepo.filter((t) => t.status === "PUBLISHED");

  const draftCount = draftMatches.length;
  const publishedCount = publishedMatches.length;
  const draftCode = draftMatches[0]?.code ?? "-";
  const publishedCode = publishedMatches[0]?.code ?? "-";

  const sourceOk = Boolean(match);
  /** One unpublished draft, or exactly one published template (no duplicate repo rows). */
  const draftOk =
    (draftCount === 1 && publishedCount === 0) || (draftCount === 0 && publishedCount === 1);
  const codeOk = publishedCount === 1 ? publishedCode === target.publishedCode : draftCount === 1;

  const codeLabel =
    publishedCount === 1
      ? `${publishedCode} (published)`
      : draftCode === "-"
        ? "-"
        : `${draftCode} (draft)`;

  return {
    project: target.project,
    repo: repoNorm,
    source: sourceOk ? "ok" : "bad",
    draft: draftOk ? "ok" : `drafts=${draftCount} published=${publishedCount}`,
    code: codeOk ? "ok" : `${codeLabel} (exp published ${target.publishedCode} or one draft)`,
    ok: sourceOk && draftOk && codeOk,
    expectedPublishedCode: target.publishedCode,
    actualDraftCode: draftCode,
    actualPublishedCode: publishedCode,
    sourceRepo: match?.repo ?? "",
    railwayProject: match?.projectName ?? "",
    railwayEnvironment: match?.environmentName ?? "",
    railwayService: match?.serviceName ?? "",
  };
}

/**
 * @param {Array<{ project: string, repo: string, publishedCode: string }>} targets
 * @param {unknown[]} projectEdges
 * @param {Array<{ status?: string, code?: string, createdAt?: string, repos?: string[] }>} templates
 * @param {string} workspaceId
 */
export function buildVerifyResult(targets, projectEdges, templates, workspaceId) {
  const checks = (targets ?? []).map((t) => evaluateTarget(t, projectEdges, templates));
  const passed = checks.filter((c) => c.ok).length;
  return {
    workspaceId,
    targets: checks.length,
    passed,
    failed: checks.length - passed,
    ok: checks.length > 0 && passed === checks.length,
    checks,
  };
}

/**
 * Failure lines for the CLI to write to stderr.
 *
 * In `--json` mode stdout is a report file (see the sync-publish workflow), so without this the
 * run only shows "exit code 1" and the reason is reachable solely by downloading the artifact.
 *
 * @param {ReturnType<typeof buildVerifyResult>} result
 * @returns {string[]}
 */
export function formatVerifyFailures(result) {
  if (result.ok) return [];
  const lines = [`Railway draft verification failed for ${result.failed} of ${result.targets} targets`];
  for (const check of result.checks) {
    if (check.ok) continue;
    const reasons = [];
    if (check.source !== "ok") {
      reasons.push(`source=bad (no workspace service deploys ${check.repo})`);
    }
    if (check.draft !== "ok") reasons.push(`draft=${check.draft}`);
    if (check.code !== "ok") reasons.push(`code=${check.code}`);
    lines.push(`${check.project}: ${reasons.join(", ")}`);
  }
  return lines;
}

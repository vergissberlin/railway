import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVerifyResult,
  collectRepos,
  evaluateTarget,
  findRepoServiceMatch,
  formatVerifyFailures,
  normalizeRepo,
} from "../scripts/lib/railway-draft-verify.mjs";

/** @param {Array<{ name: string, source?: object }>} services */
function env(name, services) {
  return {
    node: {
      name,
      serviceInstances: {
        edges: services.map((s) => ({ node: { serviceName: s.name, source: s.source ?? null } })),
      },
    },
  };
}

function project(name, environments) {
  return { node: { name, environments: { edges: environments } } };
}

const TARGET = {
  project: "railwayapp-gitlab",
  repo: "vergissberlin/railwayapp-gitlab",
  publishedCode: "gitlab-ce",
};

function publishedTemplate(code, repo, createdAt = "2026-07-01T00:00:00Z") {
  return { status: "PUBLISHED", code, createdAt, repos: [repo] };
}

function draftTemplate(code, repo, createdAt = "2026-07-01T00:00:00Z") {
  return { status: "UNPUBLISHED", code, createdAt, repos: [repo] };
}

test("normalizeRepo strips the GitHub prefix, a .git suffix and non-strings", () => {
  assert.equal(normalizeRepo("https://github.com/vergissberlin/railwayapp-grafana.git"), "vergissberlin/railwayapp-grafana");
  assert.equal(normalizeRepo("  vergissberlin/railwayapp-grafana  "), "vergissberlin/railwayapp-grafana");
  assert.equal(normalizeRepo(undefined), "");
  assert.equal(normalizeRepo(42), "");
});

test("collectRepos walks nested structures and trims", () => {
  const config = {
    services: [{ source: { repo: " owner/a " } }, { nested: { deep: { repo: "owner/b" } } }],
  };
  assert.deepEqual([...collectRepos(config)].sort(), ["owner/a", "owner/b"]);
  assert.deepEqual([...collectRepos(null)], []);
});

test("findRepoServiceMatch returns the service that deploys the repo, not the first one", () => {
  // A project with an attached database lists the image-only service first — the old lookup fell
  // back to that slot and reported source=bad for a repo that is demonstrably deployed.
  const projects = [
    project("gitlab", [
      env("production", [
        { name: "postgres", source: { image: "postgres:17" } },
        { name: "gitlab-ce", source: { repo: "vergissberlin/railwayapp-gitlab" } },
      ]),
    ]),
  ];
  const match = findRepoServiceMatch(projects, "vergissberlin/railwayapp-gitlab");
  assert.equal(match?.serviceName, "gitlab-ce");
  assert.equal(match?.projectName, "gitlab");
  assert.equal(match?.environmentName, "production");
});

test("findRepoServiceMatch prefers production over other environments", () => {
  const projects = [
    project("gitlab", [
      env("staging", [{ name: "gitlab", source: { repo: "vergissberlin/railwayapp-gitlab" } }]),
      env("production", [{ name: "gitlab", source: { repo: "vergissberlin/railwayapp-gitlab" } }]),
    ]),
  ];
  assert.equal(findRepoServiceMatch(projects, "vergissberlin/railwayapp-gitlab")?.environmentName, "production");
});

test("findRepoServiceMatch falls back to the only environment when production is absent", () => {
  const projects = [
    project("gitlab", [env("staging", [{ name: "gitlab", source: { repo: "vergissberlin/railwayapp-gitlab" } }])]),
  ];
  assert.equal(findRepoServiceMatch(projects, "vergissberlin/railwayapp-gitlab")?.environmentName, "staging");
});

test("findRepoServiceMatch matches URL sources and returns null when nothing deploys the repo", () => {
  const projects = [
    project("gitlab", [
      env("production", [{ name: "gitlab", source: { repo: "https://github.com/vergissberlin/railwayapp-gitlab.git" } }]),
    ]),
  ];
  assert.ok(findRepoServiceMatch(projects, "vergissberlin/railwayapp-gitlab"));
  assert.equal(findRepoServiceMatch(projects, "vergissberlin/railwayapp-redis"), null);
  assert.equal(findRepoServiceMatch(projects, ""), null);
});

test("findRepoServiceMatch tolerates empty and malformed nodes", () => {
  assert.equal(findRepoServiceMatch(undefined, "owner/repo"), null);
  assert.equal(findRepoServiceMatch([{}, { node: {} }, null], "owner/repo"), null);
  assert.equal(
    findRepoServiceMatch([project("p", [{}, null, env("production", [])])], "owner/repo"),
    null
  );
});

test("a published template with the expected code passes all three checks", () => {
  const projects = [
    project("gitlab", [
      env("production", [
        { name: "postgres", source: { image: "postgres:17" } },
        { name: "gitlab-ce", source: { repo: TARGET.repo } },
      ]),
    ]),
  ];
  const check = evaluateTarget(TARGET, projects, [publishedTemplate("gitlab-ce", TARGET.repo)]);
  assert.deepEqual(
    { source: check.source, draft: check.draft, code: check.code, ok: check.ok },
    { source: "ok", draft: "ok", code: "ok", ok: true }
  );
  assert.equal(check.railwayService, "gitlab-ce");
  assert.equal(check.sourceRepo, TARGET.repo);
});

test("a single unpublished draft passes, and its code is reported as the draft code", () => {
  const projects = [project("gitlab", [env("production", [{ name: "gitlab", source: { repo: TARGET.repo } }])])];
  const check = evaluateTarget(TARGET, projects, [draftTemplate("abc123", TARGET.repo)]);
  assert.equal(check.ok, true);
  assert.equal(check.actualDraftCode, "abc123");
  assert.equal(check.actualPublishedCode, "-");
});

test("a repo no workspace service deploys reports source=bad", () => {
  const projects = [project("other", [env("production", [{ name: "redis", source: { image: "redis:8" } }])])];
  const check = evaluateTarget(TARGET, projects, [publishedTemplate("gitlab-ce", TARGET.repo)]);
  assert.equal(check.source, "bad");
  assert.equal(check.ok, false);
  assert.equal(check.railwayProject, "");
});

test("a draft next to a published template reports the offending counts", () => {
  const projects = [project("gitlab", [env("production", [{ name: "gitlab", source: { repo: TARGET.repo } }])])];
  const check = evaluateTarget(TARGET, projects, [
    publishedTemplate("gitlab-ce", TARGET.repo),
    draftTemplate("abc123", TARGET.repo),
  ]);
  assert.equal(check.draft, "drafts=1 published=1");
  assert.equal(check.ok, false);
});

test("a published code that differs from the metadata reports the mismatch", () => {
  const projects = [project("gitlab", [env("production", [{ name: "gitlab", source: { repo: TARGET.repo } }])])];
  const check = evaluateTarget(TARGET, projects, [publishedTemplate("gitlab-legacy", TARGET.repo)]);
  assert.equal(check.draft, "ok");
  assert.match(check.code, /gitlab-legacy \(published\)/);
  assert.match(check.code, /exp published gitlab-ce/);
  assert.equal(check.ok, false);
});

test("newest draft wins when several drafts exist for one repo", () => {
  const projects = [project("gitlab", [env("production", [{ name: "gitlab", source: { repo: TARGET.repo } }])])];
  const check = evaluateTarget(TARGET, projects, [
    draftTemplate("older", TARGET.repo, "2026-06-01T00:00:00Z"),
    draftTemplate("newer", TARGET.repo, "2026-07-15T00:00:00Z"),
  ]);
  assert.equal(check.actualDraftCode, "newer");
  assert.equal(check.draft, "drafts=2 published=0");
});

test("buildVerifyResult counts passes and fails per target", () => {
  const targets = [
    TARGET,
    { project: "railwayapp-redis", repo: "vergissberlin/railwayapp-redis", publishedCode: "redis" },
  ];
  const projects = [
    project("gitlab", [env("production", [{ name: "gitlab", source: { repo: TARGET.repo } }])]),
  ];
  const result = buildVerifyResult(targets, projects, [publishedTemplate("gitlab-ce", TARGET.repo)], "ws-1");
  assert.equal(result.workspaceId, "ws-1");
  assert.equal(result.targets, 2);
  assert.equal(result.passed, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.ok, false);
});

test("buildVerifyResult is not ok without targets", () => {
  const result = buildVerifyResult([], [], [], "ws-1");
  assert.equal(result.ok, false);
  assert.equal(result.targets, 0);
});

test("formatVerifyFailures names every failing target and reason", () => {
  const targets = [
    TARGET,
    { project: "railwayapp-redis", repo: "vergissberlin/railwayapp-redis", publishedCode: "redis" },
  ];
  const projects = [
    project("gitlab", [env("production", [{ name: "gitlab", source: { repo: TARGET.repo } }])]),
  ];
  const result = buildVerifyResult(targets, projects, [publishedTemplate("wrong-code", TARGET.repo)], "ws-1");
  const lines = formatVerifyFailures(result);
  assert.match(lines[0], /failed for 2 of 2 targets/);
  assert.ok(lines.some((l) => l.startsWith("railwayapp-gitlab:") && l.includes("wrong-code")));
  assert.ok(
    lines.some((l) => l.includes("railwayapp-redis") && l.includes("no workspace service deploys"))
  );
});

test("formatVerifyFailures stays empty on success", () => {
  const projects = [project("gitlab", [env("production", [{ name: "gitlab", source: { repo: TARGET.repo } }])])];
  const result = buildVerifyResult([TARGET], projects, [publishedTemplate("gitlab-ce", TARGET.repo)], "ws-1");
  assert.deepEqual(formatVerifyFailures(result), []);
});

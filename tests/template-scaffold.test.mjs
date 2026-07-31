import test from "node:test";
import assert from "node:assert/strict";

import {
  DEPLOY_CODE_PLACEHOLDER,
  EXECUTABLE_FILES,
  PORT_STRATEGIES,
  REFERRAL_CODE,
  buildTemplateFiles,
  normalizeSpec,
} from "../scripts/lib/template-scaffold.mjs";

/** Minimal spec that passes validation; individual tests override single fields. */
function spec(overrides = {}) {
  return {
    displayName: "Uptime Kuma",
    slug: "uptime-kuma",
    description: "Deploy Uptime Kuma on Railway for self-hosted uptime monitoring.",
    upstreamImage: "louislam/uptime-kuma",
    versionTag: "1.23",
    port: 3001,
    healthcheckPath: "/",
    mountPath: "/app/data",
    ...overrides,
  };
}

test("normalizeSpec derives repo, project and marketplace image", () => {
  const s = normalizeSpec(spec());
  assert.equal(s.project, "railwayapp-uptime-kuma");
  assert.equal(s.repo, "vergissberlin/railwayapp-uptime-kuma");
  assert.equal(s.repoUrl, "https://github.com/vergissberlin/railwayapp-uptime-kuma");
  assert.equal(
    s.image,
    "https://raw.githubusercontent.com/vergissberlin/railwayapp-uptime-kuma/main/template-header.svg"
  );
});

test("normalizeSpec honours an explicit owner and license holder", () => {
  const s = normalizeSpec(spec({ owner: "acme", licenseHolder: "ACME Inc", licenseYear: 2030 }));
  assert.equal(s.repo, "acme/railwayapp-uptime-kuma");
  assert.equal(s.licenseHolder, "ACME Inc");
  assert.equal(s.licenseYear, 2030);
});

test("normalizeSpec lists every missing required option at once", () => {
  assert.throws(
    () => normalizeSpec({ displayName: "X" }),
    /Missing required option\(s\): slug, description, upstreamImage, versionTag, port, healthcheckPath, mountPath/
  );
});

test("normalizeSpec rejects a malformed slug", () => {
  for (const slug of ["Uptime Kuma", "uptime_kuma", "-kuma", "kuma-", "up--time"]) {
    assert.throws(() => normalizeSpec(spec({ slug })), /slug must be lowercase/, slug);
  }
});

test("normalizeSpec lowercases an otherwise valid slug", () => {
  assert.equal(normalizeSpec(spec({ slug: "UPTIME-KUMA" })).slug, "uptime-kuma");
});

test("normalizeSpec rejects an out-of-range or non-integer port", () => {
  for (const port of [0, 65536, "abc", 3.5]) {
    assert.throws(() => normalizeSpec(spec({ port })), /port must be an integer/, String(port));
  }
});

test("normalizeSpec enforces Railway's 25-75 character description limit", () => {
  assert.throws(() => normalizeSpec(spec({ description: "Too short" })), /between 25 and 75/);
});

test("normalizeSpec truncates an over-long description instead of failing", () => {
  const s = normalizeSpec(spec({ description: "D".repeat(120) }));
  assert.equal(s.description.length, 75);
});

test("normalizeSpec validates the port strategy and its dependencies", () => {
  assert.throws(() => normalizeSpec(spec({ portStrategy: "magic" })), /portStrategy must be one of/);
  assert.throws(
    () => normalizeSpec(spec({ portStrategy: "startCommand" })),
    /requires portEnvVar/
  );
  assert.throws(
    () => normalizeSpec(spec({ portStrategy: "entrypoint", portEnvVar: "X_PORT" })),
    /requires upstreamEntrypoint/
  );
  assert.equal(normalizeSpec(spec()).portStrategy, "none");
  assert.deepEqual(PORT_STRATEGIES, ["entrypoint", "startCommand", "none"]);
});

test("normalizeSpec rejects an unknown customIcon", () => {
  assert.throws(() => normalizeSpec(spec({ customIcon: "nope" })), /Unknown customIcon/);
  assert.equal(normalizeSpec(spec({ customIcon: "redis" })).customIcon, "redis");
});

test("normalizeSpec requires absolute healthcheck and mount paths", () => {
  assert.throws(() => normalizeSpec(spec({ healthcheckPath: "health" })), /healthcheckPath must start/);
  assert.throws(() => normalizeSpec(spec({ mountPath: "data" })), /mountPath must start/);
});

test("normalizeSpec supplies default feature bullets but keeps supplied ones", () => {
  assert.ok(normalizeSpec(spec()).features.length > 0);
  assert.deepEqual(normalizeSpec(spec({ features: ["Only this"] })).features, ["Only this"]);
});

test("buildTemplateFiles produces the expected file set", () => {
  const { files } = buildTemplateFiles(spec());
  for (const expected of [
    "README.md",
    "Dockerfile",
    "docker-compose.yml",
    "railway.toml",
    "railway-template.json",
    "AGENT.md",
    "CONTRIBUTING.md",
    "LICENSE",
    "CHANGELOG.md",
    ".dockerignore",
    ".gitignore",
    ".env.example",
    "renovate.json",
    "version.txt",
    ".release-please-manifest.json",
    "release-please-config.json",
    ".github/workflows/release-please.yml",
    "template-header.svg",
  ]) {
    assert.ok(files.has(expected), `missing ${expected}`);
  }
  assert.ok(!files.has("railway.json"), "railway.toml is the single source of truth");
  assert.ok(!files.has(".env"), "a real .env must never be scaffolded");
  assert.ok(!files.has("railway-entrypoint.sh"), "only written for portStrategy=entrypoint");
});

test("README starts with the H1 and the header banner, and carries one footer marker", () => {
  const readme = buildTemplateFiles(spec()).files.get("README.md");
  const lines = readme.split("\n");
  assert.equal(lines[0], "# Uptime Kuma for railway.app");
  assert.equal(lines[1], "");
  assert.equal(lines[2], "![Template Header](./template-header.svg)");
  assert.equal(lines[3], "");
  assert.equal(readme.match(/<!-- footer -->/g).length, 1);
});

test("README deploy button uses the referral schema and a replaceable code", () => {
  const readme = buildTemplateFiles(spec()).files.get("README.md");
  assert.ok(readme.includes("https://railway.com/button.svg"));
  assert.ok(readme.includes(`/deploy/${DEPLOY_CODE_PLACEHOLDER}?referralCode=${REFERRAL_CODE}`));
});

test("railway.toml carries the fixed deploy defaults", () => {
  const toml = buildTemplateFiles(spec()).files.get("railway.toml");
  assert.match(toml, /builder = "DOCKERFILE"/);
  assert.match(toml, /healthcheckTimeout = 300/);
  assert.match(toml, /restartPolicyType = "ON_FAILURE"/);
  assert.match(toml, /restartPolicyMaxRetries = 10/);
  assert.match(toml, /requiredMountPath = "\/app\/data"/);
  assert.ok(!toml.includes("startCommand"), "portStrategy=none needs no start command");
});

test("portStrategy=startCommand maps $PORT in railway.toml", () => {
  const toml = buildTemplateFiles(
    spec({
      portStrategy: "startCommand",
      portEnvVar: "UPTIME_KUMA_PORT",
      upstreamCommand: "node server/server.js",
    })
  ).files.get("railway.toml");
  assert.match(toml, /startCommand = "sh -c 'export UPTIME_KUMA_PORT=\$\{PORT:-3001\}; node server\/server\.js'"/);
});

test("portStrategy=entrypoint ships an entrypoint that execs upstream", () => {
  const { files } = buildTemplateFiles(
    spec({
      portStrategy: "entrypoint",
      portEnvVar: "INFLUXD_HTTP_BIND_ADDRESS",
      upstreamEntrypoint: "/entrypoint.sh",
      upstreamCommand: "influxd",
    })
  );
  const sh = files.get("railway-entrypoint.sh");
  assert.match(sh, /^#!\/bin\/bash/);
  assert.match(sh, /set -euo pipefail/);
  assert.match(sh, /export INFLUXD_HTTP_BIND_ADDRESS=/);
  assert.match(sh, /exec "\$\{UPSTREAM_ENTRYPOINT\}" "\$@"/);
  assert.match(files.get("Dockerfile"), /ENTRYPOINT \["\/usr\/local\/bin\/railway-entrypoint\.sh"\]/);
  assert.match(files.get("Dockerfile"), /CMD \["influxd"\]/);
  assert.ok(EXECUTABLE_FILES.includes("railway-entrypoint.sh"));
});

test("Dockerfile pins the upstream tag so Renovate can update it", () => {
  const dockerfile = buildTemplateFiles(spec()).files.get("Dockerfile");
  assert.match(dockerfile, /ARG VERSION=1\.23/);
  assert.match(dockerfile, /FROM louislam\/uptime-kuma:\$\{VERSION\}/);
});

test("railway-template.json matches the metadata schema and enables automation", () => {
  const meta = JSON.parse(buildTemplateFiles(spec()).files.get("railway-template.json"));
  assert.equal(meta.schemaVersion, 1);
  assert.equal(meta.project, "railwayapp-uptime-kuma");
  assert.equal(meta.publishedCode, "uptime-kuma");
  assert.equal(meta.displayName, "Uptime Kuma");
  assert.equal(meta.workspaceAutomation, true);
  assert.ok(meta.description.length >= 25 && meta.description.length <= 75);
});

test("railway-template.json carries optional badge and icon metadata when supplied", () => {
  const badge = { label: "Uptime Kuma", color: "5CDD8B", logo: "uptimekuma" };
  const meta = JSON.parse(
    buildTemplateFiles(spec({ badge, customIcon: "redis" })).files.get("railway-template.json")
  );
  assert.deepEqual(meta.badge, badge);
  assert.equal(meta.customIcon, "redis");
});

test("release-please config has the packages block v4 requires", () => {
  const cfg = JSON.parse(buildTemplateFiles(spec()).files.get("release-please-config.json"));
  assert.deepEqual(cfg.packages, { ".": { component: "railwayapp-uptime-kuma" } });
  assert.equal(cfg["release-type"], "simple");
  assert.equal(cfg["include-component-in-tag"], true);
});

test("secrets stay out of git: .env.example is rendered and .env is ignored", () => {
  const { files } = buildTemplateFiles(
    spec({ envVars: [{ key: "ADMIN_PASSWORD", value: "changeme", comment: "min 8 chars" }] })
  );
  const example = files.get(".env.example");
  assert.match(example, /ADMIN_PASSWORD=changeme {3}# min 8 chars/);
  assert.match(example, /Never commit `\.env`/);
  const gitignore = files.get(".gitignore");
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
});

test("docker-compose interpolates env vars instead of hardcoding credentials", () => {
  const compose = buildTemplateFiles(
    spec({ envVars: [{ key: "ADMIN_PASSWORD", value: "changeme" }] })
  ).files.get("docker-compose.yml");
  assert.match(compose, /- ADMIN_PASSWORD=\$\{ADMIN_PASSWORD\}/);
  assert.ok(!compose.includes("changeme"), "compose must not embed the sample value");
  assert.ok(!compose.includes("networks:"), "no foreign network leaks into the scaffold");
});

test("README notes the runtime strategy that was chosen", () => {
  const none = buildTemplateFiles(spec()).files.get("README.md");
  assert.match(none, /listens on `\$PORT` directly/);

  const entry = buildTemplateFiles(
    spec({
      portStrategy: "entrypoint",
      portEnvVar: "X_BIND",
      upstreamEntrypoint: "/entrypoint.sh",
    })
  ).files.get("README.md");
  assert.match(entry, /railway-entrypoint\.sh/);

  const start = buildTemplateFiles(
    spec({ portStrategy: "startCommand", portEnvVar: "X_PORT" })
  ).files.get("README.md");
  assert.match(start, /start command that exports `X_PORT`/);
});

test("README links upstream docs only when a URL is supplied", () => {
  assert.ok(
    !buildTemplateFiles(spec())
      .files.get("README.md")
      .includes("[Uptime Kuma documentation]"),
    "without docsUrl only the generic Railway links remain"
  );
  assert.match(
    buildTemplateFiles(spec({ docsUrl: "https://example.com/docs" })).files.get("README.md"),
    /\[Uptime Kuma documentation\]\(https:\/\/example\.com\/docs\)/
  );
});

test("README falls back to a note when there are no required variables", () => {
  assert.match(
    buildTemplateFiles(spec()).files.get("README.md"),
    /This template needs no required variables/
  );
});

test("AGENT.md and CONTRIBUTING.md are scoped to the new repo", () => {
  const { files } = buildTemplateFiles(spec());
  assert.match(files.get("AGENT.md"), /These rules apply to `railwayapp-uptime-kuma`/);
  assert.match(files.get("CONTRIBUTING.md"), /cd railwayapp-uptime-kuma/);
  assert.match(files.get("LICENSE"), /MIT License/);
});

test("the scaffolded banner is a valid standalone SVG", () => {
  const svg = buildTemplateFiles(spec({ customIcon: "redis" })).files.get("template-header.svg");
  assert.ok(svg.startsWith("<svg "));
  assert.ok(svg.trimEnd().endsWith("</svg>"));
  assert.match(svg, /Uptime Kuma header banner/);
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  findWorkspaceProjectByName,
  getRailwayTemplateMetadata,
  getRailwayTemplateTargets,
  loadRailwayTemplateMetadataFromDisk,
  normalizeRailwayTemplateMetadata,
  normalizeTemplateBadge,
  workspaceProjectMatchCandidatesFromMeta,
} from "../scripts/railway-template-targets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = path.join(__dirname, "fixtures", "template-metadata-root");

test("normalizeRailwayTemplateMetadata maps fields and validates description length", () => {
  const meta = normalizeRailwayTemplateMetadata(
    {
      schemaVersion: 1,
      project: "railwayapp-alpha",
      repo: "vergissberlin/railwayapp-alpha",
      displayName: "Alpha",
      publishedCode: "alpha",
      image: "https://example.com/a.svg",
      description: "Deploy Alpha software on Railway with sensible defaults here.",
      workspaceAutomation: true,
    },
    "railwayapp-alpha"
  );
  assert.equal(meta.project, "railwayapp-alpha");
  assert.equal(meta.workspaceAutomation, true);
});

test("normalizeRailwayTemplateMetadata maps railwayProjectName when set", () => {
  const meta = normalizeRailwayTemplateMetadata(
    {
      schemaVersion: 1,
      project: "railwayapp-email",
      railwayProjectName: "Email",
      repo: "vergissberlin/railwayapp-email",
      displayName: "Email App",
      publishedCode: "email",
      image: "https://example.com/e.svg",
      description: "Deploy Email software on Railway with sensible defaults here.",
      workspaceAutomation: true,
    },
    "railwayapp-email"
  );
  assert.equal(meta.railwayProjectName, "Email");
});

test("normalizeRailwayTemplateMetadata leaves railwayProjectName empty when absent", () => {
  const meta = normalizeRailwayTemplateMetadata(
    {
      schemaVersion: 1,
      project: "railwayapp-alpha",
      repo: "vergissberlin/railwayapp-alpha",
      displayName: "Alpha",
      publishedCode: "alpha",
      image: "https://example.com/a.svg",
      description: "Deploy Alpha software on Railway with sensible defaults here.",
      workspaceAutomation: true,
    },
    "railwayapp-alpha"
  );
  assert.equal(meta.railwayProjectName, "");
});

test("workspaceProjectMatchCandidatesFromMeta orders and dedupes", () => {
  const meta = normalizeRailwayTemplateMetadata(
    {
      schemaVersion: 1,
      project: "railwayapp-email",
      railwayProjectName: "Email",
      repo: "o/r",
      displayName: "Email",
      publishedCode: "e",
      image: "https://example.com/e.svg",
      description: "Deploy Email software on Railway with sensible defaults here.",
      workspaceAutomation: true,
    },
    "railwayapp-email"
  );
  assert.deepEqual(workspaceProjectMatchCandidatesFromMeta(meta), ["Email", "railwayapp-email"]);
});

test("findWorkspaceProjectByName matches exact then case-insensitive", () => {
  const projects = [
    { id: "1", name: "railwayapp-foo" },
    { id: "2", name: "Email" },
  ];
  const meta = normalizeRailwayTemplateMetadata(
    {
      schemaVersion: 1,
      project: "railwayapp-email",
      repo: "o/r",
      displayName: "Email",
      publishedCode: "e",
      image: "https://example.com/e.svg",
      description: "Deploy Email software on Railway with sensible defaults here.",
      workspaceAutomation: true,
    },
    "railwayapp-email"
  );
  assert.equal(findWorkspaceProjectByName(projects, meta)?.id, "2");

  const metaCase = normalizeRailwayTemplateMetadata(
    {
      schemaVersion: 1,
      project: "railwayapp-email",
      repo: "o/r",
      displayName: "email",
      publishedCode: "e",
      image: "https://example.com/e.svg",
      description: "Deploy Email software on Railway with sensible defaults here.",
      workspaceAutomation: true,
    },
    "railwayapp-email"
  );
  const projectsLower = [{ id: "3", name: "EMAIL" }];
  assert.equal(findWorkspaceProjectByName(projectsLower, metaCase)?.id, "3");
});

test("findWorkspaceProjectByName returns null when nothing matches", () => {
  const meta = normalizeRailwayTemplateMetadata(
    {
      schemaVersion: 1,
      project: "railwayapp-z",
      repo: "o/r",
      displayName: "Z",
      publishedCode: "z",
      image: "https://example.com/z.svg",
      description: "Deploy Z software on Railway with sensible defaults here ok.",
      workspaceAutomation: true,
    },
    "railwayapp-z"
  );
  assert.equal(findWorkspaceProjectByName([{ id: "1", name: "other" }], meta), null);
});

test("normalizeRailwayTemplateMetadata throws on wrong schemaVersion", () => {
  assert.throws(
    () =>
      normalizeRailwayTemplateMetadata(
        {
          schemaVersion: 2,
          repo: "o/r",
          displayName: "X",
          publishedCode: "x",
          image: "https://example.com/x.svg",
          description: "Deploy X on Railway with valid length strings ok.",
          workspaceAutomation: false,
        },
        "x"
      ),
    /schemaVersion/
  );
});

test("normalizeRailwayTemplateMetadata throws when required string fields missing", () => {
  assert.throws(
    () =>
      normalizeRailwayTemplateMetadata(
        {
          schemaVersion: 1,
          repo: "",
          displayName: "X",
          publishedCode: "x",
          image: "https://example.com/x.svg",
          description: "Deploy X on Railway with valid length strings ok.",
          workspaceAutomation: false,
        },
        "x"
      ),
    /Missing field/
  );
});

test("loadRailwayTemplateMetadataFromDisk reads fixture directories", () => {
  const all = loadRailwayTemplateMetadataFromDisk(FIXTURE_ROOT);
  assert.equal(all.length, 2);
  const targets = all.filter((t) => t.workspaceAutomation);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].publishedCode, "alpha");
});

test("getRailwayTemplateMetadata matches loadRailwayTemplateMetadataFromDisk for a root", () => {
  const a = loadRailwayTemplateMetadataFromDisk(FIXTURE_ROOT);
  const b = getRailwayTemplateMetadata(FIXTURE_ROOT);
  assert.deepEqual(a, b);
});

test("getRailwayTemplateTargets filters workspaceAutomation from fixture root", () => {
  const targets = getRailwayTemplateTargets(FIXTURE_ROOT);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].publishedCode, "alpha");
});

test("loadRailwayTemplateMetadataFromDisk uses folder name when project omitted", () => {
  const all = loadRailwayTemplateMetadataFromDisk(FIXTURE_ROOT);
  const beta = all.find((t) => t.publishedCode === "beta");
  assert.ok(beta);
  assert.equal(beta.project, "railwayapp-beta");
});

test("loadRailwayTemplateMetadataFromDisk throws when root missing", () => {
  assert.throws(() => loadRailwayTemplateMetadataFromDisk(path.join(os.tmpdir(), "nope-railway-root-xyz")), /not found/);
});

test("loadRailwayTemplateMetadataFromDisk throws when no json files", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "railway-empty-"));
  try {
    fs.mkdirSync(path.join(empty, "railwayapp-empty"), { recursive: true });
    assert.throws(() => loadRailwayTemplateMetadataFromDisk(empty), /No railway-template.json/);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

const BASE_META = {
  schemaVersion: 1,
  project: "railwayapp-alpha",
  repo: "vergissberlin/railwayapp-alpha",
  displayName: "Alpha",
  publishedCode: "alpha",
  image: "https://example.com/a.svg",
  description: "Deploy Alpha software on Railway with sensible defaults here.",
  workspaceAutomation: true,
};

test("normalizeTemplateBadge returns null when no badge is declared", () => {
  assert.equal(normalizeTemplateBadge(undefined, "railwayapp-alpha"), null);
  assert.equal(normalizeTemplateBadge(null, "railwayapp-alpha"), null);
});

test("normalizeTemplateBadge trims values and strips a leading hash from the colour", () => {
  assert.deepEqual(
    normalizeTemplateBadge({ label: " Alpha ", color: "#AABBCC", logo: " alpha " }, "x"),
    { label: "Alpha", color: "AABBCC", logo: "alpha" }
  );
});

test("normalizeTemplateBadge rejects a non-object badge", () => {
  assert.throws(() => normalizeTemplateBadge("nope", "railwayapp-alpha"), /badge must be an object/);
  assert.throws(() => normalizeTemplateBadge([], "railwayapp-alpha"), /badge must be an object/);
});

test("normalizeTemplateBadge names every missing field at once", () => {
  assert.throws(
    () => normalizeTemplateBadge({ label: "Alpha" }, "railwayapp-alpha"),
    /Missing badge field\(s\) color, logo in railwayapp-alpha/
  );
});

test("normalizeTemplateBadge rejects a colour that is not a 6-digit hex value", () => {
  for (const color of ["AABBC", "GGGGGG", "AABBCCDD"]) {
    assert.throws(
      () => normalizeTemplateBadge({ label: "A", color, logo: "a" }, "x"),
      /badge\.color must be a 6-digit hex/,
      color
    );
  }
});

test("normalizeRailwayTemplateMetadata passes banner and badge metadata through", () => {
  const meta = normalizeRailwayTemplateMetadata(
    {
      ...BASE_META,
      logoFile: " logo-alpha.png ",
      customIcon: " redis ",
      badge: { label: "Alpha", color: "AABBCC", logo: "alpha" },
    },
    "railwayapp-alpha"
  );
  assert.equal(meta.logoFile, "logo-alpha.png");
  assert.equal(meta.customIcon, "redis");
  assert.deepEqual(meta.badge, { label: "Alpha", color: "AABBCC", logo: "alpha" });
});

test("normalizeRailwayTemplateMetadata defaults the optional banner fields to empty", () => {
  const meta = normalizeRailwayTemplateMetadata(BASE_META, "railwayapp-alpha");
  assert.equal(meta.logoFile, "");
  assert.equal(meta.customIcon, "");
  assert.equal(meta.badge, null);
});

test("loadRailwayTemplateMetadataFromDisk returns [] for an empty root when allowEmpty is set", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "railway-targets-empty-"));
  try {
    assert.deepEqual(loadRailwayTemplateMetadataFromDisk(empty, { allowEmpty: true }), []);
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

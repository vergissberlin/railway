import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getRailwayTemplateMetadata,
  getRailwayTemplateTargets,
  loadRailwayTemplateMetadataFromDisk,
  normalizeRailwayTemplateMetadata,
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

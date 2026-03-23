/**
 * Loads per-repository `railway-template.json` files from each `railwayapp-*` submodule.
 * `RAILWAY_TEMPLATE_TARGETS` is the subset with `workspaceAutomation: true` (publish/verify scripts).
 *
 * @typedef {Object} RailwayTemplateMetadata
 * @property {string} project
 * @property {string} repo GitHub repo `owner/name`
 * @property {string} displayName
 * @property {string} publishedCode expected slug after publish
 * @property {string} image
 * @property {string} description 25–75 chars for Railway `templatePublish`
 * @property {boolean} workspaceAutomation include in root automation scripts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRailwayTemplatePublishDescription } from "./template-cli-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

/**
 * @param {Record<string, unknown>} raw
 * @param {string} folderName
 * @returns {RailwayTemplateMetadata}
 */
export function normalizeRailwayTemplateMetadata(raw, folderName) {
  if (raw.schemaVersion !== 1) {
    throw new Error(`Unsupported schemaVersion in ${folderName}/railway-template.json`);
  }
  const entry = {
    project: typeof raw.project === "string" ? raw.project : folderName,
    repo: String(raw.repo ?? "").trim(),
    displayName: String(raw.displayName ?? "").trim(),
    publishedCode: String(raw.publishedCode ?? "").trim(),
    image: String(raw.image ?? "").trim(),
    description: String(raw.description ?? "").trim(),
    workspaceAutomation: Boolean(raw.workspaceAutomation),
  };

  const missing = ["repo", "displayName", "publishedCode", "image"].filter((k) => !entry[k]);
  if (missing.length) {
    throw new Error(`Missing field(s) ${missing.join(", ")} in ${folderName}/railway-template.json`);
  }

  validateRailwayTemplatePublishDescription(entry.description);

  return entry;
}

/**
 * @param {string} [root]
 * @returns {RailwayTemplateMetadata[]}
 */
export function loadRailwayTemplateMetadataFromDisk(root = REPO_ROOT) {
  if (!fs.existsSync(root)) {
    throw new Error(`Repo root not found: ${root}`);
  }

  const names = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("railwayapp-"))
    .map((e) => e.name)
    .sort();

  const out = [];
  for (const name of names) {
    const file = path.join(root, name, "railway-template.json");
    if (!fs.existsSync(file)) continue;
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    out.push(normalizeRailwayTemplateMetadata(raw, name));
  }

  if (out.length === 0) {
    throw new Error(
      "No railway-template.json files found under railwayapp-* directories. " +
        "Run `git submodule update --init --recursive` after clone."
    );
  }

  return out;
}

export const RAILWAY_TEMPLATE_METADATA = loadRailwayTemplateMetadataFromDisk();
export const RAILWAY_TEMPLATE_TARGETS = RAILWAY_TEMPLATE_METADATA.filter((t) => t.workspaceAutomation);

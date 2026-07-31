/**
 * Loads per-repository `railway-template.json` files from each `railwayapp-*` submodule.
 * Use `getRailwayTemplateTargets()` for the subset with `workspaceAutomation: true` (publish/verify scripts).
 * Loading is lazy so importing this module does not require submodules (e.g. in CI tests).
 *
 * @typedef {Object} RailwayTemplateMetadata
 * @property {string} project
 * @property {string} repo GitHub repo `owner/name`
 * @property {string} displayName
 * @property {string} publishedCode expected slug after publish
 * @property {string} image
 * @property {string} description 25–75 chars for Railway `templatePublish`
 * @property {boolean} workspaceAutomation include in root automation scripts
 * @property {string} railwayProjectName exact Railway workspace project name if set in JSON (else "")
 * @property {string} logoFile repo-relative logo inlined into template-header.svg (else "")
 * @property {string} customIcon built-in fallback icon name when no logoFile exists (else "")
 * @property {TemplateBadge | null} badge shields.io badge for the shared README footer (else null)
 *
 * @typedef {Object} TemplateBadge
 * @property {string} label badge text
 * @property {string} color 6-digit hex without a leading #
 * @property {string} logo simple-icons slug
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateRailwayTemplatePublishDescription } from "./template-cli-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

/**
 * Badge data is optional, but a half-filled badge would silently drop the repo from the
 * shared footer, so an incomplete one is an error rather than a fallback to `null`.
 * @param {unknown} raw
 * @param {string} folderName
 * @returns {TemplateBadge | null}
 */
export function normalizeTemplateBadge(raw, folderName) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`badge must be an object in ${folderName}/railway-template.json`);
  }

  const badge = {
    label: String(raw.label ?? "").trim(),
    color: String(raw.color ?? "").trim().replace(/^#/, ""),
    logo: String(raw.logo ?? "").trim(),
  };

  const missing = ["label", "color", "logo"].filter((k) => !badge[k]);
  if (missing.length) {
    throw new Error(
      `Missing badge field(s) ${missing.join(", ")} in ${folderName}/railway-template.json`
    );
  }
  if (!/^[0-9A-Fa-f]{6}$/.test(badge.color)) {
    throw new Error(
      `badge.color must be a 6-digit hex value in ${folderName}/railway-template.json (got "${badge.color}")`
    );
  }

  return badge;
}

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
    railwayProjectName:
      typeof raw.railwayProjectName === "string" && raw.railwayProjectName.trim()
        ? raw.railwayProjectName.trim()
        : "",
    logoFile: typeof raw.logoFile === "string" ? raw.logoFile.trim() : "",
    customIcon: typeof raw.customIcon === "string" ? raw.customIcon.trim() : "",
    badge: normalizeTemplateBadge(raw.badge, folderName),
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
 * @param {{ allowEmpty?: boolean }} [opts] `allowEmpty` returns [] instead of throwing when no
 *   submodule is checked out — used by generators that legitimately run on a partial checkout.
 * @returns {RailwayTemplateMetadata[]}
 */
export function loadRailwayTemplateMetadataFromDisk(root = REPO_ROOT, opts = {}) {
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

  if (out.length === 0 && !opts.allowEmpty) {
    throw new Error(
      "No railway-template.json files found under railwayapp-* directories. " +
        "Run `git submodule update --init --recursive` after clone."
    );
  }

  return out;
}

/**
 * Ordered names to try when matching a Railway workspace project to metadata.
 * @param {RailwayTemplateMetadata} meta
 * @returns {string[]}
 */
export function workspaceProjectMatchCandidatesFromMeta(meta) {
  const candidates = [
    meta.railwayProjectName,
    meta.project,
    meta.displayName,
  ].filter((s) => s && String(s).trim());
  const seen = new Set();
  return candidates.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
}

/**
 * @param {{ id: string, name: string }[]} projects
 * @param {RailwayTemplateMetadata} meta
 * @returns {{ id: string, name: string } | null}
 */
export function findWorkspaceProjectByName(projects, meta) {
  const names = workspaceProjectMatchCandidatesFromMeta(meta);
  const byExact = new Map(projects.map((p) => [p.name, p]));
  for (const name of names) {
    const p = byExact.get(name);
    if (p) return p;
  }
  const byLower = new Map(projects.map((p) => [p.name.toLowerCase(), p]));
  for (const name of names) {
    const p = byLower.get(String(name).toLowerCase());
    if (p) return p;
  }
  return null;
}

/**
 * @param {string} [root]
 * @returns {RailwayTemplateMetadata[]}
 */
export function getRailwayTemplateMetadata(root) {
  return loadRailwayTemplateMetadataFromDisk(root);
}

/**
 * @param {string} [root]
 * @returns {RailwayTemplateMetadata[]}
 */
export function getRailwayTemplateTargets(root) {
  return getRailwayTemplateMetadata(root).filter((t) => t.workspaceAutomation);
}
